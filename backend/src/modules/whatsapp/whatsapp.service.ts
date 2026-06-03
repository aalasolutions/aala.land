// backend/src/modules/whatsapp/whatsapp.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BaileysManagerService, BaileysInstance } from './baileys-manager.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { AiHistoryMessage, WaChat, WaMessage, WaStatus } from './wa-types';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private wiredUsers = new Set<string>();
  private readonly dataDir = process.env.WHATSAPP_DATA_DIR ?? join(process.cwd(), 'data', 'whatsapp');

  constructor(
    private readonly manager: BaileysManagerService,
    private readonly store: MessageStoreService,
    private readonly ai: WhatsappAiService,
    private readonly gateway: WhatsappGateway,
  ) {}

  // ── Boot wiring ────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    // BaileysManagerService.onModuleInit already ran — wire any pre-started instances
    for (const [userId, inst] of this.manager.getAll()) {
      const companyId = this.readPersistedCompanyId(userId);
      if (companyId) {
        this.wireInstance(userId, companyId, inst);
        this.wiredUsers.add(userId);
        this.logger.log(`Auto-wired AI for user ${userId}`);
      }
    }
  }

  // ── Instance wiring ────────────────────────────────────────────────────

  private async ensureInstance(userId: string, companyId: string): Promise<BaileysInstance> {
    const inst = await this.manager.getOrCreate(userId);
    if (!this.wiredUsers.has(userId)) {
      this.wiredUsers.add(userId);
      this.persistCompanyId(userId, companyId);
      this.wireInstance(userId, companyId, inst);
    }
    return inst;
  }

  private persistCompanyId(userId: string, companyId: string): void {
    try {
      writeFileSync(join(this.dataDir, 'sessions', userId, 'company_id'), companyId, 'utf8');
    } catch { /* non-fatal */ }
  }

  private readPersistedCompanyId(userId: string): string | null {
    try {
      const p = join(this.dataDir, 'sessions', userId, 'company_id');
      return existsSync(p) ? readFileSync(p, 'utf8').trim() : null;
    } catch { return null; }
  }

  private wireInstance(userId: string, companyId: string, inst: BaileysInstance): void {
    inst.emitter.on('status', data => this.gateway.emitStatus(userId, data));
    inst.emitter.on('qr',     data => this.gateway.emitQR(userId, data));
    inst.emitter.on('message', (msg: WaMessage) => {
      this.store.addMessage(userId, msg);
      this.gateway.emitMessage(userId, msg);
      if (!msg.fromMe) {
        this.ai.handleIncomingMessage(msg, companyId, userId, async (chatId, message) => {
          const result = await inst.sendMessage(chatId, message);
          const aiMsg: WaMessage = {
            id: result.messageId ?? `ai-${Date.now()}`,
            chatId,
            senderId: inst.getStatus().me?.id ?? 'me',
            senderName: 'You',
            chatName: msg.chatName,
            isGroup: chatId.endsWith('@g.us'),
            body: message,
            hasMedia: false, mediaType: '', mediaUrls: [],
            mentionedIds: [], quotedParticipant: '',
            fromMe: true, aiGenerated: true,
            timestamp: Math.floor(Date.now() / 1000),
          };
          this.store.addMessage(userId, aiMsg);
          this.gateway.emitMessage(userId, aiMsg);
          return result;
        }).catch(err => this.logger.error('AI handler error', err));
      }
    });
  }

  // ── Connection ────────────────────────────────────────────────────────

  async getConnection(userId: string, companyId: string): Promise<WaStatus> {
    const inst = await this.ensureInstance(userId, companyId);
    return inst.getStatus();
  }

  async getQR(userId: string, companyId: string): Promise<{ qr: string | null; hasCredentials: boolean; connection: string }> {
    const inst = await this.ensureInstance(userId, companyId);
    const s = inst.getStatus();
    return { qr: s.qr, hasCredentials: s.hasCredentials, connection: s.connection };
  }

  async logout(userId: string, companyId: string): Promise<{ success: boolean }> {
    const inst = this.manager.get(userId);
    if (inst) {
      await inst.logout();
      inst.emitter.removeAllListeners();
    }
    this.store.clearAll(userId);
    this.ai.clearUserState(userId);
    this.wiredUsers.delete(userId);
    await this.manager.remove(userId);
    return { success: true };
  }

  // ── Messages / Chats ──────────────────────────────────────────────────

  getChats(userId: string): WaChat[] {
    return this.store.getChatList(userId);
  }

  getAllMessages(userId: string): WaMessage[] {
    return this.store.getAllMessages(userId);
  }

  getMessagesForChat(userId: string, chatId: string): WaMessage[] {
    return this.store.getMessagesForChat(userId, chatId);
  }

  async send(userId: string, companyId: string, chatId: string, message: string, replyTo?: string) {
    const inst = await this.ensureInstance(userId, companyId);
    const result = await inst.sendMessage(chatId, message, { replyTo });
    if (result.messageId) {
      const { me } = inst.getStatus();
      this.store.addMessage(userId, {
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
    }
    return result;
  }

  async sendMedia(userId: string, companyId: string, chatId: string, filePath: string, opts: any) {
    const inst = await this.ensureInstance(userId, companyId);
    return inst.sendMedia(chatId, filePath, opts);
  }

  async typing(userId: string, companyId: string, chatId: string) {
    const inst = await this.ensureInstance(userId, companyId);
    return inst.sendTyping(chatId);
  }

  // ── AI ────────────────────────────────────────────────────────────────

  getAiConfig(userId: string): ReturnType<WhatsappAiService['getConfig']> {
    return this.ai.getConfig(userId);
  }

  getAiHistory(userId: string, chatId: string): AiHistoryMessage[] {
    return this.ai.getHistoryFor(userId, chatId);
  }

  toggleAi(userId: string, _companyId: string, enabled?: boolean): { enabled: boolean } {
    const next = typeof enabled === 'boolean'
      ? this.ai.setEnabled(userId, enabled)
      : this.ai.setEnabled(userId, !this.ai.isEnabled(userId));
    this.gateway.emitAi(userId, { enabled: next, keyConfigured: this.ai.getConfig(userId).keyConfigured });
    return { enabled: next };
  }

  // ── Media ─────────────────────────────────────────────────────────────

  getMediaDirs(userId: string): Record<string, string> {
    const mediaBase = join(this.dataDir, 'media', userId);
    return {
      IMAGE_DIR: join(mediaBase, 'images'),
      VIDEO_DIR: join(mediaBase, 'videos'),
      AUDIO_DIR: join(mediaBase, 'audio'),
      DOCUMENT_DIR: join(mediaBase, 'documents'),
    };
  }
}
