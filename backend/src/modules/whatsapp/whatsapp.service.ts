// backend/src/modules/whatsapp/whatsapp.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { BaileysService } from './baileys.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappGateway } from './whatsapp.gateway';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly baileys: BaileysService,
    private readonly store: MessageStoreService,
    private readonly ai: WhatsappAiService,
    private readonly gateway: WhatsappGateway,
  ) {}

  onModuleInit() {
    this.baileys.emitter.on('status', data => this.gateway.emitStatus(data));
    this.baileys.emitter.on('qr',     data => this.gateway.emitQR(data));
    this.baileys.emitter.on('message', msg => {
      this.store.addMessage(msg);
      this.gateway.emitMessage(msg);

      if (!msg.fromMe) {
        this.ai.handleIncomingMessage(msg, async (chatId, message) => {
          const result = await this.baileys.sendMessage(chatId, message);
          const aiMsg = {
            id: result.messageId ?? `ai-${Date.now()}`,
            chatId,
            senderId: this.baileys.getStatus().me?.id ?? 'me',
            senderName: 'You',
            chatName: msg.chatName,
            isGroup: chatId.endsWith('@g.us'),
            body: message,
            hasMedia: false, mediaType: '', mediaUrls: [],
            mentionedIds: [], quotedParticipant: '',
            fromMe: true, aiGenerated: true,
            timestamp: Math.floor(Date.now() / 1000),
          };
          this.store.addMessage(aiMsg);
          this.gateway.emitMessage(aiMsg);
          this.ai.recordAssistantTurn(chatId, message);
          return result;
        }).catch(err => this.logger.error('AI handler error', err));
      }
    });
  }

  // ── Connection ────────────────────────────────────────────────────────

  getConnection() { return this.baileys.getStatus(); }

  getQR() {
    const s = this.baileys.getStatus();
    return { qr: s.qr, hasCredentials: s.hasCredentials, connection: s.connection };
  }

  async logout() {
    await this.baileys.logout();
    await this.baileys.start();
    return { success: true };
  }

  // ── Messages / Chats ──────────────────────────────────────────────────

  getChats()                             { return this.store.getChatList(); }
  getAllMessages()                        { return this.store.getAllMessages(); }
  getMessagesForChat(chatId: string)     { return this.store.getMessagesForChat(chatId); }

  async send(chatId: string, message: string, replyTo?: string) {
    const result = await this.baileys.sendMessage(chatId, message, { replyTo });
    if (result.messageId) {
      const { me } = this.baileys.getStatus();
      this.store.addMessage({
        id: result.messageId,
        chatId,
        senderId: me?.id ?? 'me',
        senderName: 'You',
        chatName: chatId.split('@')[0],
        isGroup: chatId.endsWith('@g.us'),
        body: message,
        hasMedia: false, mediaType: '', mediaUrls: [],
        mentionedIds: [], quotedParticipant: '',
        fromMe: true, aiGenerated: false,
        timestamp: Math.floor(Date.now() / 1000),
      });
      this.ai.recordAssistantTurn(chatId, message);
    }
    return result;
  }

  async sendMedia(chatId: string, filePath: string, opts: any) {
    return this.baileys.sendMedia(chatId, filePath, opts);
  }

  async typing(chatId: string) { return this.baileys.sendTyping(chatId); }

  // ── AI ────────────────────────────────────────────────────────────────

  getAiConfig()              { return this.ai.getConfig(); }
  getAiHistory(chatId: string) { return this.ai.getHistoryFor(chatId); }
  clearAiHistory(chatId?: string) { this.ai.clearHistory(chatId); return { success: true }; }

  toggleAi(enabled?: boolean) {
    const next = typeof enabled === 'boolean' ? this.ai.setEnabled(enabled) : this.ai.setEnabled(!this.ai.isEnabled());
    this.gateway.emitAi({ enabled: next, keyConfigured: this.ai.getConfig().keyConfigured });
    return { enabled: next };
  }

  // ── Media ─────────────────────────────────────────────────────────────

  getMediaDirs() { return this.baileys.getMediaDirs(); }
}
