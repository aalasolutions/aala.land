// backend/src/modules/whatsapp/baileys-manager.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import * as QRCode from 'qrcode';
import { WaMessage, WaStatus } from './wa-types';

// ── Types for injected Baileys functions ─────────────────────────────────────

interface BaileysFns {
  makeWASocket: (opts: any) => any;
  useMultiFileAuthState: (dir: string) => Promise<{ state: any; saveCreds: () => Promise<void> }>;
  DisconnectReason: Record<string, number>;
  downloadMediaMessage: (msg: any, type: string, opts: any) => Promise<any>;
  jidNormalizedUser: (jid: string) => string;
}

// ── BaileysInstance (plain class, NOT a NestJS provider) ─────────────────────

export class BaileysInstance {
  public readonly emitter = new EventEmitter();

  private sock: any = null;
  private shouldReconnect = true;
  private reconnectPending = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectedAt = 0;
  private status: WaStatus = {
    connection: 'disconnected',
    hasCredentials: false,
    me: null,
    qr: null,
  };

  constructor(
    public readonly userId: string,
    private readonly sessionDir: string,
    private readonly mediaDirs: Record<string, string>,
    private readonly baileysFns: BaileysFns,
    private readonly logger: Logger,
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // Clean up any existing socket BEFORE creating a new one.
    // Without this, the old socket's event handlers keep firing after reconnect,
    // triggering another close → another reconnect → infinite loop.
    if (this.sock) {
      const old = this.sock;
      this.sock = null;
      old.ev.removeAllListeners();
      await old.end(undefined).catch(() => {});
    }

    this.status.connection = 'connecting';
    this.status.qr = null;
    this.emitter.emit('status', { ...this.status });

    const { state, saveCreds } = await this.baileysFns.useMultiFileAuthState(this.sessionDir);

    this.sock = this.baileysFns.makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: this.silentLogger(),
      browser: [process.env.WHATSAPP_BROWSER ?? 'AALA.LAND', 'Chrome', '1.0.0'],
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr);
          this.status.qr = dataUrl;
          this.emitter.emit('qr', { dataUrl });
        } catch {
          this.logger.warn(`[${this.userId}] QR generation failed`);
        }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === this.baileysFns.DisconnectReason.loggedOut;
        this.logger.log(`[${this.userId}] Disconnected — code ${code ?? 'unknown'}${loggedOut ? ' (logged out)' : ''}`);
        this.status = {
          ...this.status,
          connection: 'disconnected',
          me: null,
          hasCredentials: !loggedOut,
        };
        this.emitter.emit('status', { ...this.status });
        if (!loggedOut && this.shouldReconnect && !this.reconnectPending) {
          this.reconnectPending = true;
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnectPending = false;
            void this.start();
          }, 3000);
        }
      } else if (connection === 'open') {
        this.connectedAt = Math.floor(Date.now() / 1000);
        this.status.connection = 'connected';
        this.status.qr = null;
        this.status.hasCredentials = true;
        this.status.me = this.sock.user
          ? {
              id: this.baileysFns.jidNormalizedUser(this.sock.user.id),
              name: this.sock.user.name ?? '',
            }
          : null;
        this.emitter.emit('status', { ...this.status });
        this.logger.log(`[${this.userId}] Connected as ${this.status.me?.id}`);
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
      if (type !== 'notify' && type !== 'append') return;
      for (const raw of messages) {
        // For append (messages sent from phone), only process messages sent after we connected
        // to avoid replaying the full history on every reconnect
        if (type === 'append') {
          const ts = raw.messageTimestamp ? Number(raw.messageTimestamp) : 0;
          if (ts < this.connectedAt) continue;
        }
        try {
          const evt = await this.processRawMessage(raw);
          if (evt) this.emitter.emit('message', evt);
        } catch (err) {
          this.logger.error(
            `[${this.userId}] Message processing failed`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    });
  }

  async stop(): Promise<void> {
    this.shouldReconnect = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.reconnectPending = false;
    if (this.sock) {
      this.sock.ev.removeAllListeners();
      await this.sock.end(undefined).catch(() => {});
      this.sock = null;
    }
  }

  async logout(): Promise<void> {
    this.shouldReconnect = false;
    await this.stop();
    rmSync(this.sessionDir, { recursive: true, force: true });
    mkdirSync(this.sessionDir, { recursive: true });
    this.status = { connection: 'disconnected', hasCredentials: false, me: null, qr: null };
    this.emitter.emit('status', { ...this.status });
    this.shouldReconnect = true;
  }

  // ── Status ──────────────────────────────────────────────────────────────

  getStatus(): WaStatus { return { ...this.status }; }
  hasCredentials(): boolean { return this.status.hasCredentials; }

  // ── Sending ─────────────────────────────────────────────────────────────

  async sendMessage(chatId: string, message: string, _opts: { replyTo?: string } = {}) {
    this.assertConnected();
    const content: any = { text: message };
    // opts.replyTo is accepted by the API but silently dropped here: Baileys requires a full
    // WAProto.IWebMessageInfo object for `quoted`, and we don't store raw protos.
    // Passing only { key: {...} } crashes normalizeMessageContent with a TypeError.
    const result = await this.sock.sendMessage(chatId, content);
    return { success: true, messageId: result?.key?.id as string | undefined };
  }

  async sendMedia(
    chatId: string,
    filePath: string,
    opts: { mediaType?: string; caption?: string; fileName?: string } = {},
  ) {
    this.assertConnected();
    if (!existsSync(filePath)) {
      const err: any = new Error('File not found');
      err.code = 'FILE_NOT_FOUND';
      throw err;
    }
    const type = opts.mediaType ?? 'document';
    const content: any = { [type]: { url: filePath }, caption: opts.caption };
    if (type === 'document') content.fileName = opts.fileName ?? filePath.split('/').pop();
    const result = await this.sock.sendMessage(chatId, content);
    return { success: true, messageId: result?.key?.id as string | undefined };
  }

  async sendTyping(chatId: string) {
    if (!this.sock) return { success: false };
    await this.sock.sendPresenceUpdate('composing', chatId);
    return { success: true };
  }

  async editMessage(chatId: string, messageId: string, message: string) {
    this.assertConnected();
    const result = await this.sock.sendMessage(chatId, {
      edit: { key: { id: messageId, remoteJid: chatId }, messageTimestamp: 0 },
      text: message,
    });
    return { success: true, messageId: result?.key?.id as string | undefined };
  }

  async getChatInfo(chatId: string) {
    return { chatId, isGroup: chatId.endsWith('@g.us'), name: chatId.split('@')[0] };
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private assertConnected() {
    if (!this.sock || this.status.connection !== 'connected') {
      const err: any = new Error('WhatsApp not connected');
      err.code = 'NOT_CONNECTED';
      throw err;
    }
  }

  private async processRawMessage(raw: any): Promise<WaMessage | null> {
    const key = raw.key;
    if (!key?.remoteJid || key.remoteJid === 'status@broadcast') return null;

    const chatId = key.remoteJid;
    const fromMe = !!key.fromMe;
    const msg = raw.message;
    if (!msg) return null;

    const text =
      msg.conversation ??
      msg.extendedTextMessage?.text ??
      msg.imageMessage?.caption ??
      msg.videoMessage?.caption ??
      msg.documentMessage?.caption ??
      '';

    const mediaType = msg.imageMessage
      ? 'image'
      : msg.videoMessage
        ? 'video'
        : msg.audioMessage
          ? msg.audioMessage.ptt
            ? 'ptt'
            : 'audio'
          : msg.documentMessage
            ? 'document'
            : msg.stickerMessage
              ? 'sticker'
              : '';

    let mediaUrls: string[] = [];
    if (mediaType) {
      try {
        const subdir = ['image', 'sticker'].includes(mediaType)
          ? this.mediaDirs.IMAGE_DIR
          : mediaType === 'video'
            ? this.mediaDirs.VIDEO_DIR
            : ['audio', 'ptt'].includes(mediaType)
              ? this.mediaDirs.AUDIO_DIR
              : this.mediaDirs.DOCUMENT_DIR;
        const ext = this.mediaExtension(mediaType, msg);
        const safeId = basename(key.id ?? String(Date.now()));
        const filePath = join(subdir, `${safeId}.${ext}`);
        const buffer = await this.baileysFns.downloadMediaMessage(raw, 'buffer', {});
        writeFileSync(filePath, buffer as Buffer);
        mediaUrls = [filePath];
      } catch {
        this.logger.warn(`[${this.userId}] Media download failed for ${key.id}`);
      }
    }

    const isGroup = chatId.endsWith('@g.us');
    const senderId = fromMe ? (this.status.me?.id ?? 'me') : (key.participant ?? chatId);
    const senderName = fromMe ? 'You' : (raw.pushName ?? senderId.split('@')[0]);
    const chatName = isGroup
      ? chatId.split('@')[0]
      : fromMe
        ? (this.status.me?.id?.split('@')[0] ?? 'You')
        : senderName;

    return {
      id: key.id ?? String(Date.now()),
      chatId,
      senderId,
      senderName,
      chatName,
      isGroup,
      fromMe,
      body: text || (mediaType ? `[${mediaType}]` : ''),
      hasMedia: !!mediaType,
      mediaType,
      mediaUrls,
      mentionedIds: msg.extendedTextMessage?.contextInfo?.mentionedJid ?? [],
      quotedParticipant: msg.extendedTextMessage?.contextInfo?.participant ?? '',
      aiGenerated: false,
      timestamp: raw.messageTimestamp ? Number(raw.messageTimestamp) : Math.floor(Date.now() / 1000),
    };
  }

  private mediaExtension(mediaType: string, msg: any): string {
    if (['image', 'sticker'].includes(mediaType)) return 'jpg';
    if (mediaType === 'video') return 'mp4';
    if (['audio', 'ptt'].includes(mediaType)) return 'ogg';
    if (mediaType === 'document') {
      const ext = (msg.documentMessage?.fileName ?? '').split('.').pop();
      return ext && ext.length <= 5 ? ext : 'bin';
    }
    return 'bin';
  }

  private silentLogger() {
    const noop = () => {};
    const logger: any = {
      level: 'silent',
      trace: noop,
      debug: noop,
      info: noop,
      warn: noop,
      error: noop,
      fatal: noop,
    };
    logger.child = () => logger;
    return logger;
  }
}

// ── BaileysManagerService ────────────────────────────────────────────────────

@Injectable()
export class BaileysManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaileysManagerService.name);

  private instances = new Map<string, BaileysInstance>();
  private inFlight = new Map<string, Promise<BaileysInstance>>();

  // Resolved once in onModuleInit; may be pre-injected in tests
  private baileysFns: BaileysFns | null = null;
  private dataDir: string = process.env.WHATSAPP_DATA_DIR ?? join(process.cwd(), 'data', 'whatsapp');

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    // Import Baileys ESM once
    const b = await import('@whiskeysockets/baileys');
    this.baileysFns = {
      makeWASocket: b.default,
      useMultiFileAuthState: b.useMultiFileAuthState,
      DisconnectReason: b.DisconnectReason as unknown as Record<string, number>,
      downloadMediaMessage: b.downloadMediaMessage as (msg: any, type: string, opts: any) => Promise<any>,
      jidNormalizedUser: b.jidNormalizedUser,
    };

    // Scan sessions/ dir and auto-start existing sessions
    const sessionsRoot = join(this.dataDir, 'sessions');
    mkdirSync(sessionsRoot, { recursive: true });

    try {
      const entries = readdirSync(sessionsRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const userId = entry.name;
        const credsPath = join(sessionsRoot, userId, 'creds.json');
        if (existsSync(credsPath)) {
          this.logger.log(`Auto-starting session for user ${userId}`);
          await this.getOrCreate(userId);
        }
      }
    } catch (err) {
      this.logger.warn('Could not scan sessions directory', err instanceof Error ? err.message : err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const stops = [...this.instances.values()].map(inst =>
      inst.stop().catch(err =>
        this.logger.error(`Error stopping instance ${inst.userId}`, err instanceof Error ? err.message : err),
      ),
    );
    await Promise.all(stops);
    this.instances.clear();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async getOrCreate(userId: string): Promise<BaileysInstance> {
    const existing = this.instances.get(userId);
    if (existing) return existing;

    if (this.inFlight.has(userId)) return this.inFlight.get(userId)!;

    const p = this._create(userId);
    this.inFlight.set(userId, p);

    try {
      const inst = await p;
      this.instances.set(userId, inst);
      return inst;
    } finally {
      this.inFlight.delete(userId);
    }
  }

  get(userId: string): BaileysInstance | undefined {
    return this.instances.get(userId);
  }

  getAll(): Map<string, BaileysInstance> {
    return this.instances;
  }

  async remove(userId: string): Promise<void> {
    const inst = this.instances.get(userId);
    if (inst) {
      await inst.stop().catch(err =>
        this.logger.error(`Error stopping instance ${userId}`, err instanceof Error ? err.message : err),
      );
      this.instances.delete(userId);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async _create(userId: string): Promise<BaileysInstance> {
    if (!this.baileysFns) {
      throw new Error('BaileysManagerService: baileysFns not initialized — did onModuleInit run?');
    }

    const sessionDir = join(this.dataDir, 'sessions', userId);
    const mediaDirs = {
      IMAGE_DIR: join(this.dataDir, 'media', userId, 'images'),
      VIDEO_DIR: join(this.dataDir, 'media', userId, 'videos'),
      AUDIO_DIR: join(this.dataDir, 'media', userId, 'audio'),
      DOCUMENT_DIR: join(this.dataDir, 'media', userId, 'documents'),
    };

    // Ensure directories exist
    mkdirSync(sessionDir, { recursive: true });
    for (const dir of Object.values(mediaDirs)) {
      mkdirSync(dir, { recursive: true });
    }

    const inst = new BaileysInstance(
      userId,
      sessionDir,
      mediaDirs,
      this.baileysFns,
      this.logger,
    );

    await inst.start();
    return inst;
  }
}
