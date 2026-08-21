import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from './entities/whatsapp-connection.entity';
import { MessageStoreService } from './message-store.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappAiService, SendFn, MarkReadFn } from './whatsapp-ai.service';
import { WaMessage } from './wa-types';
import { EncryptionService } from '../encryption/encryption.service';

// Pinned on purpose: a version bump is a deliberate act, never a drift.
const GRAPH_VERSION = 'v23.0';

const DEFAULT_SEND_TIMEOUT_MS = 15000;

// Meta's code for an invalid or expired access token.
const GRAPH_TOKEN_INVALID_CODE = 190;

// A reply that never reached Meta. Thrown so the turn's own catch runs and neither the
// delivery record nor the assistant history is written for a message nobody received.
export class WhatsappSendError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly graphCode?: number,
  ) {
    super(message);
    this.name = 'WhatsappSendError';
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

  // The single seam where a stored token becomes a bearer. Writers do the mirror image:
  // `access_token_ciphertext` is only ever assigned from `EncryptionService.encrypt`.
  // A dead key or a tampered row decrypts to null, which every caller already treats as
  // "no token" and fails closed on, so the outcome is a refused send, not a crash.
  resolveAccessToken(connection: WhatsappConnection): string | null {
    return this.encryption.decrypt(connection.accessTokenCiphertext);
  }

  async findConnected(userId: string): Promise<WhatsappConnection | null> {
    return this.connections.findOne({
      where: { userId, status: WhatsappConnectionStatus.CONNECTED },
    });
  }

  private messagesUrl(connection: WhatsappConnection): string {
    return `https://graph.facebook.com/${GRAPH_VERSION}/${connection.phoneNumberId}/messages`;
  }

  private resolveTimeoutMs(): number {
    const parsed = parseInt(
      process.env.WHATSAPP_SEND_TIMEOUT_MS ?? String(DEFAULT_SEND_TIMEOUT_MS),
      10,
    );
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_SEND_TIMEOUT_MS;
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
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Cloud API send error: ${reason}`);
      throw new WhatsappSendError(`Cloud API send error: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // Meta has no standalone typing call: the indicator rides this read receipt for one
  // inbound message id, clears after 25 seconds or when the reply lands, and Meta asks
  // it only be shown when a reply is actually coming. Log-only on purpose, never throws:
  // a failed read receipt must not cost the turn the reply it was about to send.
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
      this.logger.warn(
        `Cloud API mark-as-read error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // The typing rider's seam, resolved by the processor exactly like the sender is.
  markReadFor(userId: string): MarkReadFn {
    return async (messageId, withTyping) => {
      const connection = await this.findConnected(userId);
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

  // Only definitive token-invalid answers land here, so a dead connection stops being
  // an invisible log line. Every other Graph failure stays log-only for now.
  private async flagConnection(
    connection: WhatsappConnection,
    status: number,
    graphCode: number | null,
  ): Promise<void> {
    const reason = graphCode
      ? `token_invalid_${graphCode}`
      : `token_invalid_http_${status}`;
    try {
      await this.connections.update(
        { id: connection.id },
        {
          status: WhatsappConnectionStatus.FLAGGED,
          disconnectReason: reason,
        },
      );
      this.logger.error(
        `Connection ${connection.phoneNumberId} flagged (${reason}); it needs reconnecting`,
      );
    } catch (err) {
      this.logger.error(
        'Failed to flag the WhatsApp connection',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // The Phase 2 transport behind the debounce. Mirrors the old send closure:
  // transport, persist the outbound row, live push to the operator, credit refresh.
  senderFor(userId: string): SendFn {
    return async (chatId, message, meta) => {
      const connection = await this.findConnected(userId);
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
      void this.persistOutbound(
        connection.companyId,
        userId,
        aiMsg,
        connection.phoneNumberId,
      );
      this.gateway.emitMessage(userId, aiMsg);

      // Only a newly opened window moves these numbers; reuse turns would requery
      // twice per reply to emit what the client already has.
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
          .catch(() => undefined);
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
        err instanceof Error ? err.message : err,
      );
    }
  }
}
