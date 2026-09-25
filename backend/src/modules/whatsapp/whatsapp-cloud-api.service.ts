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
import { GRAPH_VERSION, WaMessage } from './wa-types';
import { EncryptionService } from '../encryption/encryption.service';
import { errorMessage } from '@shared/utils/error.util';
import { envInt } from '@shared/utils/env.util';

const DEFAULT_SEND_TIMEOUT_MS = 15000;

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
          type: 'text',
          text: { body },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const raw = await res.text();
        const graphCode = this.graphErrorCode(raw);
        this.logger.error(
          `Cloud API send failed ${res.status} (graph code ${graphCode ?? 'none'}) for ${connection.phoneNumberId}: ${raw.slice(0, 500)}`,
        );
        if (res.status === 401 || graphCode === GRAPH_TOKEN_INVALID_CODE) {
          await this.flagConnection(connection, res.status, graphCode);
        }
        throw new WhatsappSendError(
          `Cloud API send failed ${res.status}`,
          res.status,
          graphCode ?? undefined,
        );
      }
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
      if (err instanceof WhatsappSendError) throw err;
      const reason = errorMessage(err);
      this.logger.error(`Cloud API send error: ${reason}`);
      throw new WhatsappSendError(`Cloud API send error: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
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

  private graphErrorCode(raw: string): number | null {
    try {
      const parsed = JSON.parse(raw) as { error?: { code?: number } };
      return typeof parsed.error?.code === 'number' ? parsed.error.code : null;
    } catch {
      return null;
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
        id: result.messageId,
        chatId,
        senderId: connection.displayPhoneNumber,
        senderName: connection.displayPhoneNumber,
        chatName: chatId,
        isGroup: false,
        body: message,
        hasMedia: false,
        mediaType: 'text',
        mediaUrls: [],
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
