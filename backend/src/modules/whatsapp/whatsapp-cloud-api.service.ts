import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from './entities/whatsapp-connection.entity';
import { MessageStoreService } from './message-store.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappAiService, SendFn, MarkReadFn } from './whatsapp-ai.service';
import { randomUUID } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import {
  GRAPH_VERSION,
  WA_MESSAGE_NO_STORED_MEDIA,
  WaMessage,
} from './wa-types';
import { EncryptionService } from '../encryption/encryption.service';
import type { WaOutboundMediaType } from './wa-media.util';
import { errorMessage } from '@shared/utils/error.util';
import { envInt } from '@shared/utils/env.util';

const DEFAULT_SEND_TIMEOUT_MS = 15000;
const DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS = 120000;

const CAPTIONED_MEDIA_TYPES = new Set(['image', 'video', 'document']);

// Meta's code for an invalid or expired access token.
const GRAPH_TOKEN_INVALID_CODE = 190;

// Meta's code for a free-form send outside the 24h customer service window.
export const GRAPH_REPLY_WINDOW_CLOSED_CODE = 131047;

// A reply Meta did not accept; thrown so the turn's catch skips writing delivery record or history.
export class WhatsappSendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly graphCode?: number,
    // Set only when the stored token could not be resolved: reconnecting is the only fix.
    readonly needsReconnect?: boolean,
  ) {
    super(message);
    this.name = 'WhatsappSendError';
  }

  get windowClosed(): boolean {
    return this.graphCode === GRAPH_REPLY_WINDOW_CLOSED_CODE;
  }
}

// Graph's answer for an object id that does not exist, which is how an expired media id reads.
const GRAPH_UNKNOWN_OBJECT_CODE = 100;
const GRAPH_UNKNOWN_OBJECT_SUBCODE = 33;

export interface WhatsappOutboundMedia {
  type: WaOutboundMediaType;
  mediaId: string;
  caption?: string;
  fileName?: string;
  voice?: boolean;
}

export interface WhatsappMediaInfo {
  url: string;
  file_size: number | null;
  mime_type: string | null;
  sha256: string | null;
}

// isMediaGone means no retry can succeed: Meta no longer holds the media id.
export class WhatsappMediaFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly isMediaGone = false,
    readonly graphCode?: number,
  ) {
    super(message);
    this.name = 'WhatsappMediaFetchError';
  }
}

@Injectable()
export class WhatsappCloudApiService {
  private readonly logger = new Logger(WhatsappCloudApiService.name);

  constructor(
    @InjectRepository(WhatsappConnection)
    private readonly connections: Repository<WhatsappConnection>,
    private readonly store: MessageStoreService,
    private readonly gateway: WhatsappGateway,
    private readonly ai: WhatsappAiService,
    private readonly encryption: EncryptionService,
  ) {}

  // The only seam turning a stored token into a bearer; a dead key decrypts to null and callers fail closed.
  resolveAccessToken(connection: WhatsappConnection): string | null {
    return this.encryption.decrypt(connection.accessTokenCiphertext);
  }

  async findConnected(
    companyId: string,
    userId: string,
  ): Promise<WhatsappConnection | null> {
    return this.connections.findOne({
      where: { companyId, userId, status: WhatsappConnectionStatus.CONNECTED },
    });
  }

  private messagesUrl(connection: WhatsappConnection): string {
    return `https://graph.facebook.com/${GRAPH_VERSION}/${connection.phoneNumberId}/messages`;
  }

  private resolveTimeoutMs(): number {
    return envInt('WHATSAPP_SEND_TIMEOUT_MS', DEFAULT_SEND_TIMEOUT_MS, 1);
  }

  async sendText(
    connection: WhatsappConnection,
    to: string,
    body: string,
  ): Promise<{ messageId: string }> {
    return this.postMessage(connection, to, {
      type: 'text',
      text: { body },
    });
  }

  // Meta takes a caption on image, video and document only, and a file name on documents only.
  async sendMedia(
    connection: WhatsappConnection,
    to: string,
    media: WhatsappOutboundMedia,
  ): Promise<{ messageId: string }> {
    const object: Record<string, unknown> = { id: media.mediaId };
    if (media.caption && CAPTIONED_MEDIA_TYPES.has(media.type)) {
      object.caption = media.caption;
    }
    if (media.type === 'document' && media.fileName) {
      object.filename = media.fileName;
    }
    if (media.type === 'audio' && media.voice) object.voice = true;
    return this.postMessage(connection, to, {
      type: media.type,
      [media.type]: object,
    });
  }

  // Streams the file from disk as multipart; returns the Meta media id the send refers to.
  async uploadMedia(
    connection: WhatsappConnection,
    token: string,
    file: { path: string; mime: string; fileName: string },
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      envInt(
        'WHATSAPP_MEDIA_UPLOAD_TIMEOUT_MS',
        DEFAULT_MEDIA_UPLOAD_TIMEOUT_MS,
        1,
      ),
    );
    try {
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', file.mime);
      form.append(
        'file',
        await openAsBlob(file.path, { type: file.mime }),
        file.fileName,
      );
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${connection.phoneNumberId}/media`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          signal: controller.signal,
        },
      );
      if (!res.ok)
        throw await this.sendFailure(connection, res, 'media upload');
      const data = (await res.json()) as { id?: unknown };
      if (typeof data.id !== 'string' || !data.id) {
        this.logger.error(
          `Cloud API accepted the media upload but returned no media id for ${connection.phoneNumberId}`,
        );
        throw new WhatsappSendError('Cloud API returned no media id');
      }
      return data.id;
    } catch (err) {
      throw this.toSendError(err, 'media upload');
    } finally {
      clearTimeout(timer);
    }
  }

  private async postMessage(
    connection: WhatsappConnection,
    to: string,
    content: Record<string, unknown>,
  ): Promise<{ messageId: string }> {
    const token = this.resolveAccessToken(connection);
    if (!token) {
      this.logger.error(
        `No access token on connection ${connection.phoneNumberId}; reply not sent`,
      );
      throw new WhatsappSendError(
        `No access token on connection ${connection.phoneNumberId}`,
        undefined,
        undefined,
        true,
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.resolveTimeoutMs());
    try {
      const res = await fetch(this.messagesUrl(connection), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          ...content,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw await this.sendFailure(connection, res, 'send');
      const data = (await res.json()) as {
        messages?: Array<{ id?: string }>;
      };
      const messageId = data.messages?.[0]?.id;
      if (!messageId) {
        this.logger.error(
          `Cloud API accepted the send but returned no message id for ${connection.phoneNumberId}`,
        );
        throw new WhatsappSendError('Cloud API returned no message id');
      }
      return { messageId };
    } catch (err) {
      throw this.toSendError(err, 'send');
    } finally {
      clearTimeout(timer);
    }
  }

  private async sendFailure(
    connection: WhatsappConnection,
    res: Response,
    action: string,
  ): Promise<WhatsappSendError> {
    const raw = await res.text();
    const graphCode = this.graphError(raw).code ?? null;
    this.logger.error(
      `Cloud API ${action} failed ${res.status} (graph code ${graphCode ?? 'none'}) for ${connection.phoneNumberId}: ${raw.slice(0, 500)}`,
    );
    if (res.status === 401 || graphCode === GRAPH_TOKEN_INVALID_CODE) {
      await this.flagConnection(connection, res.status, graphCode);
    }
    return new WhatsappSendError(
      `Cloud API ${action} failed ${res.status}`,
      res.status,
      graphCode ?? undefined,
    );
  }

  private toSendError(err: unknown, action: string): WhatsappSendError {
    if (err instanceof WhatsappSendError) return err;
    const reason = errorMessage(err);
    this.logger.error(`Cloud API ${action} error: ${reason}`);
    return new WhatsappSendError(`Cloud API ${action} error: ${reason}`);
  }

  // The returned url lives 5 minutes and needs the same bearer token.
  async getMedia(
    connection: WhatsappConnection,
    token: string,
    mediaId: string,
  ): Promise<WhatsappMediaInfo> {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(connection.phoneNumberId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.resolveTimeoutMs());
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const raw = await res.text();
        const error = this.graphError(raw);
        if (res.status === 401 || error.code === GRAPH_TOKEN_INVALID_CODE) {
          await this.flagConnection(connection, res.status, error.code ?? null);
        }
        const isMediaGone =
          res.status === 404 ||
          (res.status === 400 &&
            error.code === GRAPH_UNKNOWN_OBJECT_CODE &&
            error.subcode === GRAPH_UNKNOWN_OBJECT_SUBCODE);
        throw new WhatsappMediaFetchError(
          `Graph media lookup failed ${res.status} (graph code ${error.code ?? 'none'}): ${raw.slice(0, 300)}`,
          res.status,
          isMediaGone,
          error.code,
        );
      }
      const data = (await res.json()) as {
        url?: unknown;
        file_size?: unknown;
        mime_type?: unknown;
        sha256?: unknown;
      };
      if (typeof data.url !== 'string' || !data.url) {
        throw new WhatsappMediaFetchError('Graph media lookup returned no url');
      }
      const size = Number(data.file_size);
      return {
        url: data.url,
        file_size: Number.isFinite(size) ? size : null,
        mime_type: typeof data.mime_type === 'string' ? data.mime_type : null,
        sha256: typeof data.sha256 === 'string' ? data.sha256 : null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // The caller owns the signal, since the body streams long after this resolves.
  async openMediaDownload(
    token: string,
    url: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => undefined);
      throw new WhatsappMediaFetchError(
        `Media download failed ${res.status}`,
        res.status,
      );
    }
    return res;
  }

  // Meta has no standalone typing call: this read-receipt rider is log-only so it never blocks the reply.
  async markRead(
    connection: WhatsappConnection,
    messageId: string,
    withTyping: boolean,
  ): Promise<void> {
    const token = this.resolveAccessToken(connection);
    if (!token) {
      this.logger.warn(
        `No access token on connection ${connection.phoneNumberId}; read receipt skipped`,
      );
      return;
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };
    if (withTyping) payload.typing_indicator = { type: 'text' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.resolveTimeoutMs());
    try {
      const res = await fetch(this.messagesUrl(connection), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        const raw = await res.text();
        this.logger.warn(
          `Cloud API mark-as-read failed ${res.status} for ${connection.phoneNumberId}: ${raw.slice(0, 500)}`,
        );
      }
    } catch (err) {
      this.logger.warn(`Cloud API mark-as-read error: ${errorMessage(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // The typing rider's seam, resolved by the processor exactly like the sender is.
  markReadFor(companyId: string, userId: string): MarkReadFn {
    return async (messageId, withTyping) => {
      const connection = await this.findConnected(companyId, userId);
      if (!connection) return;
      await this.markRead(connection, messageId, withTyping);
    };
  }

  private graphError(raw: string): { code?: number; subcode?: number } {
    try {
      const parsed = JSON.parse(raw) as {
        error?: { code?: unknown; error_subcode?: unknown };
      };
      const { code, error_subcode: subcode } = parsed.error ?? {};
      return {
        code: typeof code === 'number' ? code : undefined,
        subcode: typeof subcode === 'number' ? subcode : undefined,
      };
    } catch {
      return {};
    }
  }

  // Only definitive token-invalid answers flag the connection; every other Graph failure stays log-only.
  private async flagConnection(
    connection: WhatsappConnection,
    status: number,
    graphCode: number | null,
  ): Promise<void> {
    const reason = graphCode
      ? `token_invalid_${graphCode}`
      : `token_invalid_http_${status}`;
    try {
      // Scoped to unflagged rows, so a repeat failure changes nothing and pushes nothing.
      const result = await this.connections.update(
        { id: connection.id, status: Not(WhatsappConnectionStatus.FLAGGED) },
        {
          status: WhatsappConnectionStatus.FLAGGED,
          disconnectReason: reason,
        },
      );
      this.logger.error(
        `Connection ${connection.phoneNumberId} flagged (${reason}); it needs reconnecting`,
      );
      if (result.affected) this.pushConnectionChange(connection);
    } catch (err) {
      this.logger.error(
        'Failed to flag the WhatsApp connection',
        errorMessage(err),
      );
    }
  }

  // A live push failure is log-only; the status is already stored.
  private pushConnectionChange(connection: WhatsappConnection): void {
    try {
      this.gateway.emitConnection(connection.userId, {
        status: WhatsappConnectionStatus.FLAGGED,
      });
    } catch (err) {
      this.logger.error(
        `Failed to push connection status ${WhatsappConnectionStatus.FLAGGED} for user ${connection.userId}`,
        errorMessage(err, true),
      );
    }
  }

  senderFor(companyId: string, userId: string): SendFn {
    return async (chatId, message, meta) => {
      const connection = await this.findConnected(companyId, userId);
      if (!connection) {
        this.logger.error(
          `No connected WhatsApp number for user ${userId}; AI reply not sent`,
        );
        throw new WhatsappSendError(
          `No connected WhatsApp number for user ${userId}`,
        );
      }

      const result = await this.sendText(connection, chatId, message);

      const aiMsg: WaMessage = {
        uuid: randomUUID(),
        ...WA_MESSAGE_NO_STORED_MEDIA,
        id: result.messageId,
        chatId,
        senderId: connection.displayPhoneNumber,
        senderName: connection.displayPhoneNumber,
        chatName: chatId,
        isGroup: false,
        body: message,
        hasMedia: false,
        mediaType: 'text',
        mentionedIds: [],
        quotedParticipant: '',
        fromMe: true,
        aiGenerated: true,
        timestamp: Math.floor(Date.now() / 1000),
        originUserId: userId,
      };
      // Awaited: persistOutbound never throws, but an uncommitted row drops Meta's near-instant sent callback.
      await this.persistOutbound(
        connection.companyId,
        userId,
        aiMsg,
        connection.phoneNumberId,
      );
      this.gateway.emitMessage(userId, aiMsg);

      // Only a newly opened window moves these numbers, avoiding a requery of data the client already has.
      if (meta?.creditCharged) {
        void this.ai
          .getCreditUsage(connection.companyId)
          .then((usage) => {
            if (usage)
              this.gateway.emitAi(userId, {
                creditsUsed: usage.used,
                creditsLimit: usage.limit,
                openWindows: usage.openWindows,
              });
          })
          .catch((err: unknown) =>
            this.logger.debug(
              `Credit usage push failed for ${connection.companyId}: ${errorMessage(err)}`,
            ),
          );
      }
      return result;
    };
  }

  private async persistOutbound(
    companyId: string,
    userId: string,
    msg: WaMessage,
    phoneNumberId: string,
  ): Promise<void> {
    try {
      await this.store.addMessage(companyId, userId, msg, phoneNumberId);
    } catch (err) {
      this.logger.error(
        'Failed to persist outbound AI message',
        errorMessage(err),
      );
    }
  }
}
