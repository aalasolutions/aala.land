// backend/src/modules/whatsapp/whatsapp.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { User } from '../users/entities/user.entity';
import {
  BaileysManagerService,
  BaileysInstance,
} from './baileys-manager.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappGateway } from './whatsapp.gateway';
import {
  AiCreditUsageWithAgents,
  AiHistoryMessage,
  WaChat,
  WaMessage,
  WaStatus,
} from './wa-types';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private wiredUsers = new Set<string>();
  private readonly persistedCompanyIds = new Map<string, string>();
  private readonly dataDir =
    process.env.WHATSAPP_DATA_DIR ?? join(process.cwd(), 'data', 'whatsapp');

  constructor(
    private readonly manager: BaileysManagerService,
    private readonly store: MessageStoreService,
    private readonly ai: WhatsappAiService,
    private readonly gateway: WhatsappGateway,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  // ── Boot wiring ────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    // Before wiring: BaileysManagerService auto-starts every session directory on boot,
    // so a removal whose logout failed comes back live on every deploy.
    await this.dropSessionsWithoutActiveSeat();

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

  /**
   * Stops any running session whose user is gone or deactivated. A session directory is
   * not authority to connect: the seat may have been removed while this instance was
   * down, or the logout on the removal path may have failed.
   *
   * Stops WITHOUT erasing credentials. Only a real removal deletes those. This runs
   * automatically at boot on the result of a seat lookup, so a wrong database, a stale
   * restore or a half-applied migration would classify every session as an orphan; the
   * cost of that must be a restart, not every agent in every company re-pairing by hand.
   */
  async dropSessionsWithoutActiveSeat(): Promise<number> {
    const userIds = [...this.manager.getAll().keys()];
    if (userIds.length === 0) return 0;

    const active = await this.users.find({
      where: { id: In(userIds), isActive: true },
      select: { id: true },
    });
    const activeIds = new Set(active.map((u) => u.id));
    const orphans = userIds.filter((id) => !activeIds.has(id));

    for (const userId of orphans) {
      try {
        await this.stopSessionKeepingCredentials(userId);
        this.logger.warn(
          `Stopped WhatsApp session for user ${userId}: no active seat`,
        );
      } catch (err) {
        this.logger.error(
          `Could not stop WhatsApp session for user ${userId}`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return orphans.length;
  }

  private async stopSessionKeepingCredentials(userId: string): Promise<void> {
    this.manager.get(userId)?.emitter.removeAllListeners();
    this.ai.clearUserState(userId);
    this.persistedCompanyIds.delete(userId);
    this.wiredUsers.delete(userId);
    await this.manager.remove(userId);
  }

  /** Live count of connected WhatsApp instances (operator scoreboard tile). */
  countConnectedInstances(): number {
    let connected = 0;
    for (const [, inst] of this.manager.getAll()) {
      if (inst.getStatus().connection === 'connected') connected++;
    }
    return connected;
  }

  // ── Instance wiring ────────────────────────────────────────────────────

  private async ensureInstance(
    userId: string,
    companyId: string,
  ): Promise<BaileysInstance> {
    const inst = await this.manager.getOrCreate(userId);
    this.persistCompanyId(userId, companyId);
    if (!this.wiredUsers.has(userId)) {
      this.wiredUsers.add(userId);
      this.wireInstance(userId, companyId, inst);
    }
    return inst;
  }

  private persistCompanyId(userId: string, companyId: string): void {
    if (this.persistedCompanyIds.get(userId) === companyId) return;
    this.persistedCompanyIds.set(userId, companyId);
    try {
      writeFileSync(
        join(this.dataDir, 'sessions', userId, 'company_id'),
        companyId,
        'utf8',
      );
    } catch {
      /* non-fatal */
    }
  }

  private readPersistedCompanyId(userId: string): string | null {
    try {
      const p = join(this.dataDir, 'sessions', userId, 'company_id');
      return existsSync(p) ? readFileSync(p, 'utf8').trim() : null;
    } catch {
      return null;
    }
  }

  private wireInstance(
    userId: string,
    companyId: string,
    inst: BaileysInstance,
  ): void {
    void this.ai.loadEnabledState(userId, companyId);
    // Track message IDs sent by AI so when Baileys re-emits them as fromMe events
    // we don't mistakenly treat them as a human reply and trigger the silence window.
    const aiSentIds = new Set<string>();
    // Content fallback: Baileys sendMessage may return without a key.id, so the echo
    // can't be matched by id. Track a short-lived (chatId + body) fingerprint of each
    // AI send so we still recognise the echo and don't treat it as a human reply.
    // A Map counter (not a Set) so N identical AI sends within the window are matched by
    // exactly N echoes: two identical sends must not collapse to one entry (which would
    // let the second echo be misread as a human reply and falsely mute the AI).
    const aiSentFingerprints = new Map<string, number>();
    const fingerprint = (chatId: string, body: string) =>
      `${chatId} ${body ?? ''}`;
    // Increment the fingerprint counter for one AI send.
    const addFingerprint = (fp: string) => {
      aiSentFingerprints.set(fp, (aiSentFingerprints.get(fp) ?? 0) + 1);
      setTimeout(() => decrementFingerprint(fp), 60_000);
    };
    // Consume one matching echo: decrement, delete the key when the count reaches 0.
    const decrementFingerprint = (fp: string): boolean => {
      const count = aiSentFingerprints.get(fp);
      if (!count) return false;
      if (count <= 1) aiSentFingerprints.delete(fp);
      else aiSentFingerprints.set(fp, count - 1);
      return true;
    };
    inst.emitter.on('status', (data) => {
      this.gateway.emitStatus(userId, data);
    });
    inst.emitter.on('qr', (data) => this.gateway.emitQR(userId, data));
    inst.emitter.on('message', (msg: WaMessage) => {
      void this.persistMessage(companyId, userId, msg);
      this.gateway.emitMessage(userId, msg);
      if (msg.fromMe) {
        const fp = fingerprint(msg.chatId, msg.body);
        // messageId match is the PRIMARY signal; the fingerprint counter is the fallback
        // for sends with no messageId. Consume exactly one fingerprint slot per matched
        // echo (whether matched by id or by fingerprint) so N identical AI sends are
        // matched by N echoes and a genuine later human message with identical text
        // (count already drained to 0) is still recorded as a human reply.
        const idMatch = aiSentIds.has(msg.id);
        const fpMatch = decrementFingerprint(fp);
        const isAiEcho = idMatch || fpMatch;
        if (!isAiEcho) this.ai.recordHumanReply(userId, msg.chatId);
      }
      if (!msg.fromMe) {
        this.ai
          .handleIncomingMessage(
            msg,
            companyId,
            userId,
            async (chatId, message, meta) => {
              // Register the echo fingerprint BEFORE sending so the fromMe re-emission
              // (which can arrive before or without a messageId) is always recognised.
              const fp = fingerprint(chatId, message);
              addFingerprint(fp);
              const result = await inst.sendMessage(chatId, message);
              if (result.messageId) {
                aiSentIds.add(result.messageId);
                setTimeout(() => aiSentIds.delete(result.messageId!), 60_000);
              }
              const aiMsg: WaMessage = {
                id: result.messageId ?? `ai-${Date.now()}`,
                chatId,
                senderId: inst.getStatus().me?.id ?? 'me',
                senderName: 'You',
                chatName: msg.chatName,
                isGroup: chatId.endsWith('@g.us'),
                body: message,
                hasMedia: false,
                mediaType: '',
                mediaUrls: [],
                mentionedIds: [],
                quotedParticipant: '',
                fromMe: true,
                aiGenerated: true,
                timestamp: Math.floor(Date.now() / 1000),
              };
              void this.persistMessage(companyId, userId, aiMsg);
              this.gateway.emitMessage(userId, aiMsg);
              // Only a newly opened window moves these numbers; reuse turns would
              // requery twice per reply to emit what the client already has.
              if (meta?.creditCharged) {
                void this.ai
                  .getCreditUsage(companyId)
                  .then((usage) => {
                    if (usage)
                      this.gateway.emitAi(userId, {
                        creditsUsed: usage.used,
                        creditsLimit: usage.limit,
                        openWindows: usage.openWindows,
                      });
                  })
                  .catch(() => {});
              }
              return result;
            },
          )
          .catch((err) => this.logger.error('AI handler error', err));
      }
    });
  }

  // Logged, not thrown: a DB failure must not break the live chat or the AI turn.
  private async persistMessage(
    companyId: string,
    userId: string,
    msg: WaMessage,
  ): Promise<void> {
    try {
      await this.store.addMessage(companyId, userId, msg);
    } catch (err) {
      this.logger.error(
        `Failed to persist WhatsApp message ${msg.id}`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── Connection ────────────────────────────────────────────────────────

  async getConnection(userId: string, companyId: string): Promise<WaStatus> {
    const inst = await this.ensureInstance(userId, companyId);
    return inst.getStatus();
  }

  async getQR(
    userId: string,
    companyId: string,
  ): Promise<{
    qr: string | null;
    hasCredentials: boolean;
    connection: string;
  }> {
    const inst = await this.ensureInstance(userId, companyId);
    const s = inst.getStatus();
    return {
      qr: s.qr,
      hasCredentials: s.hasCredentials,
      connection: s.connection,
    };
  }

  async logout(
    userId: string,
    companyId: string,
  ): Promise<{ success: boolean }> {
    const inst = this.manager.get(userId);
    if (inst) {
      await inst.logout();
      inst.emitter.removeAllListeners();
    } else {
      const sessionDir = join(this.dataDir, 'sessions', userId);
      if (existsSync(sessionDir))
        rmSync(sessionDir, { recursive: true, force: true });
    }
    this.ai.clearUserState(userId);
    this.ai.clearPromptCache(companyId);
    this.persistedCompanyIds.delete(userId);
    this.wiredUsers.delete(userId);
    await this.manager.remove(userId);
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

  async send(
    userId: string,
    companyId: string,
    chatId: string,
    message: string,
    replyTo?: string,
  ) {
    const inst = await this.ensureInstance(userId, companyId);
    const result = await inst.sendMessage(chatId, message, { replyTo });
    if (result.messageId) {
      const { me } = inst.getStatus();
      await this.persistMessage(companyId, userId, {
        id: result.messageId,
        chatId,
        senderId: me?.id ?? 'me',
        senderName: 'You',
        // Empty so the store's placeholder rule applies and a real pushName can win.
        chatName: '',
        isGroup: chatId.endsWith('@g.us'),
        body: message,
        hasMedia: false,
        mediaType: '',
        mediaUrls: [],
        mentionedIds: [],
        quotedParticipant: '',
        fromMe: true,
        aiGenerated: false,
        timestamp: Math.floor(Date.now() / 1000),
      });
    }
    return result;
  }

  async sendMedia(
    userId: string,
    companyId: string,
    chatId: string,
    filePath: string,
    opts: any,
  ) {
    const inst = await this.ensureInstance(userId, companyId);
    return inst.sendMedia(chatId, filePath, opts);
  }

  async typing(userId: string, companyId: string, chatId: string) {
    const inst = await this.ensureInstance(userId, companyId);
    return inst.sendTyping(chatId);
  }

  // ── AI ────────────────────────────────────────────────────────────────

  getAiConfig(userId: string, companyId: string) {
    return this.ai.getConfigWithUsage(userId, companyId);
  }

  getAiCreditUsage(companyId: string): Promise<AiCreditUsageWithAgents | null> {
    return this.ai.getCreditUsageWithAgents(companyId);
  }

  getAiHistory(userId: string, chatId: string): AiHistoryMessage[] {
    return this.ai.getHistoryFor(userId, chatId);
  }

  async toggleAi(
    userId: string,
    companyId: string,
    enabled?: boolean,
  ): Promise<{ enabled: boolean }> {
    const next =
      typeof enabled === 'boolean' ? enabled : !this.ai.isEnabled(userId);
    await this.ai.persistEnabled(userId, companyId, next);
    this.gateway.emitAi(userId, {
      enabled: next,
      keyConfigured: !!process.env.OLLAMA_API_KEY,
    });
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
