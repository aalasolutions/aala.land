// backend/src/modules/whatsapp/whatsapp.service.ts
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageStoreService } from './message-store.service';
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
import {
  AiCreditUsageWithAgents,
  AiHistoryMessage,
  WaChat,
  WaMessage,
} from './wa-types';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    @InjectRepository(WhatsappConnection)
    private readonly connections: Repository<WhatsappConnection>,
    private readonly store: MessageStoreService,
    private readonly ai: WhatsappAiService,
    private readonly gateway: WhatsappGateway,
    private readonly cloud: WhatsappCloudApiService,
  ) {}

  // ── Connection ────────────────────────────────────────────────────────

  async disconnect(
    userId: string,
    companyId: string,
  ): Promise<{ success: boolean }> {
    // Row first: a turn already in flight must not find a CONNECTED row and send anyway.
    await this.connections.update(
      { userId, companyId },
      {
        status: WhatsappConnectionStatus.DISCONNECTED,
        disconnectedAt: new Date(),
      },
    );
    await this.ai.clearUserState(userId);
    this.ai.clearPromptCache(companyId);
    return { success: true };
  }

  // ── Messages / Chats ──────────────────────────────────────────────────

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
  ): Promise<WaMessage[]> {
    return this.store.getMessagesForChat(companyId, userId, chatId);
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

    // First on purpose: cancel any queued AI turn so it cannot fire after the human spoke
    await this.ai.recordHumanReply(userId, chatId);

    let sent: { messageId: string };
    try {
      sent = await this.cloud.sendText(connection, chatId, body);
    } catch (err) {
      if (!(err instanceof WhatsappSendError)) throw err;
      // The operator learns the send failed; the token and the raw Graph body stay in the log.
      throw new BadGatewayException(
        err.status
          ? `WhatsApp rejected the message (HTTP ${err.status}); it was not sent`
          : 'WhatsApp could not be reached; the message was not sent',
      );
    }

    const msg: WaMessage = {
      id: sent.messageId,
      chatId,
      senderId: connection.displayPhoneNumber,
      senderName: connection.displayPhoneNumber,
      chatName: chatId,
      isGroup: false,
      body,
      hasMedia: false,
      mediaType: 'text',
      mediaUrls: [],
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
        err instanceof Error ? err.message : err,
      );
    }
    this.gateway.emitMessage(userId, msg);
    return msg;
  }

  // ── AI ────────────────────────────────────────────────────────────────

  getAiConfig(userId: string, companyId: string) {
    return this.ai.getConfigWithUsage(userId, companyId);
  }

  getAiCreditUsage(companyId: string): Promise<AiCreditUsageWithAgents | null> {
    return this.ai.getCreditUsageWithAgents(companyId);
  }

  getAiHistory(userId: string, chatId: string): Promise<AiHistoryMessage[]> {
    return this.ai.getHistoryFor(userId, chatId);
  }

  async toggleAi(
    userId: string,
    companyId: string,
    enabled?: boolean,
  ): Promise<{ enabled: boolean }> {
    const next =
      typeof enabled === 'boolean'
        ? enabled
        : !(await this.ai.isEnabledFor(userId, companyId));
    await this.ai.persistEnabled(userId, companyId, next);
    this.gateway.emitAi(userId, {
      enabled: next,
      keyConfigured: !!process.env.OLLAMA_API_KEY,
    });
    return { enabled: next };
  }
}
