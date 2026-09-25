import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { MessageStoreService, REPLY_WINDOW_S } from './message-store.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappGateway } from './whatsapp.gateway';
import {
  WhatsappCloudApiService,
  WhatsappSendError,
} from './whatsapp-cloud-api.service';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from './entities/whatsapp-connection.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';
import {
  AiCreditUsageWithAgents,
  AiHistoryMessage,
  WaChat,
  WaConnectionInfo,
  WA_MESSAGE_NO_STORED_MEDIA,
  WaMessage,
  WaMessageWindow,
} from './wa-types';
import { errorMessage } from '@shared/utils/error.util';
import { envString } from '@shared/utils/env.util';

const REPLY_WINDOW_CLOSED_MESSAGE =
  'The 24-hour reply window is closed. The customer must message first.';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    @InjectRepository(WhatsappConnection)
    private readonly connections: Repository<WhatsappConnection>,
    @InjectRepository(WhatsappChat)
    private readonly chats: Repository<WhatsappChat>,
    private readonly store: MessageStoreService,
    private readonly ai: WhatsappAiService,
    private readonly gateway: WhatsappGateway,
    private readonly cloud: WhatsappCloudApiService,
  ) {}

  // Field-by-field on purpose: accessTokenCiphertext must never reach a response.
  async getConnection(
    userId: string,
    companyId: string,
  ): Promise<WaConnectionInfo | null> {
    const row = await this.connections.findOne({ where: { userId, companyId } });
    if (!row) return null;
    return {
      status: row.status,
      displayPhoneNumber: row.displayPhoneNumber,
      connectedAt: row.connectedAt ? row.connectedAt.toISOString() : null,
      disconnectedAt: row.disconnectedAt
        ? row.disconnectedAt.toISOString()
        : null,
      disconnectReason: row.disconnectReason ?? null,
      historySyncStatus: row.historySyncStatus ?? null,
      historySyncProgress: row.historySyncProgress ?? null,
    };
  }

  async disconnect(
    userId: string,
    companyId: string,
  ): Promise<{ success: boolean }> {
    // Row updated and token wiped first, so no in-flight turn finds CONNECTED or a departed seat reconnects stale.
    await this.connections.update(
      { userId, companyId },
      {
        status: WhatsappConnectionStatus.DISCONNECTED,
        disconnectedAt: new Date(),
        accessTokenCiphertext: null,
        tokenUpdatedAt: null,
      },
    );
    await this.ai.clearUserState(userId, companyId);
    this.ai.clearPromptCache(companyId);
    return { success: true };
  }

  getChats(companyId: string, userId: string): Promise<WaChat[]> {
    return this.store.getChatList(companyId, userId);
  }

  getAllMessages(
    companyId: string,
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{ messages: WaMessage[]; hasMore: boolean }> {
    return this.store.getAllMessages(companyId, userId, page, limit);
  }

  getMessagesForChat(
    companyId: string,
    userId: string,
    chatId: string,
    limit?: number,
    before?: string,
  ): Promise<{ messages: WaMessage[]; hasMore: boolean }> {
    return this.store.getMessagesForChat(
      companyId,
      userId,
      chatId,
      limit,
      before,
    );
  }

  getMessagesAfter(
    companyId: string,
    userId: string,
    chatId: string,
    after: string,
    limit?: number,
  ): Promise<{ messages: WaMessage[]; hasMore: boolean }> {
    return this.store.getMessagesAfter(companyId, userId, chatId, after, limit);
  }

  getMessagesAround(
    companyId: string,
    userId: string,
    chatId: string,
    around: string,
    limit?: number,
  ): Promise<WaMessageWindow> {
    return this.store.getMessagesAround(
      companyId,
      userId,
      chatId,
      around,
      limit,
    );
  }

  // The human operator's send path. No credit is ever consumed here; credits are AI-only.
  async sendMessage(
    userId: string,
    companyId: string,
    chatId: string,
    body: string,
  ): Promise<WaMessage> {
    const connection = await this.connections.findOne({
      where: { userId, companyId, status: WhatsappConnectionStatus.CONNECTED },
    });
    if (!connection) {
      throw new BadRequestException(
        'No connected WhatsApp number for this user. Connect a number before sending.',
      );
    }

    // Checked before the AI pause so a send refused here leaves the AI state untouched.
    await this.assertReplyWindowOpen(companyId, userId, chatId);

    // Cancels any queued AI turn first so it can't fire after the human spoke; a failed send below then leaves it off.
    await this.ai.recordHumanReply(userId, chatId);

    let sent: { messageId: string };
    try {
      sent = await this.cloud.sendText(connection, chatId, body);
    } catch (err) {
      if (!(err instanceof WhatsappSendError)) throw err;
      if (err.windowClosed) {
        throw new ConflictException(REPLY_WINDOW_CLOSED_MESSAGE);
      }
      if (err.needsReconnect) {
        throw new ServiceUnavailableException(
          'This WhatsApp connection needs reconnecting; the message was not sent',
        );
      }
      // The operator learns the send failed; the token and the raw Graph body stay in the log.
      throw new BadGatewayException(
        err.status
          ? `WhatsApp rejected the message (HTTP ${err.status}); it was not sent`
          : 'WhatsApp could not be reached; the message was not sent',
      );
    }

    const msg: WaMessage = {
      uuid: randomUUID(),
      ...WA_MESSAGE_NO_STORED_MEDIA,
      id: sent.messageId,
      chatId,
      senderId: connection.displayPhoneNumber,
      senderName: connection.displayPhoneNumber,
      chatName: chatId,
      isGroup: false,
      body,
      hasMedia: false,
      mediaType: 'text',
      mentionedIds: [],
      quotedParticipant: '',
      fromMe: true,
      aiGenerated: false,
      timestamp: Math.floor(Date.now() / 1000),
      originUserId: userId,
    };

    // Meta already has the message: a store outage must not read as a failed send and invite a duplicate
    try {
      await this.store.addMessage(
        companyId,
        userId,
        msg,
        connection.phoneNumberId,
      );
    } catch (err) {
      this.logger.error(
        `Failed to persist operator message ${msg.id}`,
        errorMessage(err),
      );
    }
    this.gateway.emitMessage(userId, msg);
    return msg;
  }

  private async assertReplyWindowOpen(
    companyId: string,
    userId: string,
    chatId: string,
  ): Promise<void> {
    const chat = await this.chats.findOne({
      where: { companyId, userId, chatId },
      select: { id: true, lastInboundAt: true },
    });
    const lastInboundAt = chat?.lastInboundAt?.getTime();
    if (!lastInboundAt || Date.now() - lastInboundAt >= REPLY_WINDOW_S * 1000) {
      throw new ConflictException(REPLY_WINDOW_CLOSED_MESSAGE);
    }
  }

  getAiConfig(companyId: string) {
    return this.ai.getConfigWithUsage(companyId);
  }

  getAiCreditUsage(companyId: string): Promise<AiCreditUsageWithAgents | null> {
    return this.ai.getCreditUsageWithAgents(companyId);
  }

  getAiHistory(userId: string, chatId: string): Promise<AiHistoryMessage[]> {
    return this.ai.getHistoryFor(userId, chatId);
  }

  // persistEnabled throws on a failed write, so the emit below only ever announces a toggle that stuck.
  async toggleAi(
    userId: string,
    companyId: string,
    enabled?: boolean,
  ): Promise<{ enabled: boolean }> {
    const next =
      typeof enabled === 'boolean'
        ? enabled
        : !(await this.ai.isEnabledFor(companyId));
    await this.ai.persistEnabled(companyId, next);
    this.gateway.emitAi(userId, {
      enabled: next,
      keyConfigured: !!envString('OLLAMA_API_KEY'),
    });
    return { enabled: next };
  }
}
