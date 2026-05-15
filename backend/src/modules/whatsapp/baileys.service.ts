// backend/src/modules/whatsapp/baileys.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import * as QRCode from 'qrcode';
import { WaMessage, WaStatus } from './wa-types';

@Injectable()
export class BaileysService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaileysService.name);
  readonly emitter = new EventEmitter();

  private sock: any = null;
  private shouldReconnect = true;
  private status: WaStatus = { connection: 'disconnected', hasCredentials: false, me: null, qr: null };

  // ESM imports resolved in onModuleInit
  private makeWASocket: any;
  private useMultiFileAuthState: any;
  private DisconnectReason: any;
  private downloadMediaMessage: any;
  private jidNormalizedUser: any;

  // ── Directory helpers ─────────────────────────────────────────────────

  private get dataDir(): string {
    return process.env.WHATSAPP_DATA_DIR ?? join(process.cwd(), 'data', 'whatsapp');
  }

  get sessionDir(): string {
    return process.env.WHATSAPP_SESSION_DIR ?? join(this.dataDir, 'session');
  }

  get mediaDir(): string {
    return process.env.WHATSAPP_MEDIA_DIR ?? join(this.dataDir, 'media');
  }

  getMediaDirs() {
    return {
      IMAGE_DIR: join(this.mediaDir, 'images'),
      VIDEO_DIR: join(this.mediaDir, 'videos'),
      AUDIO_DIR: join(this.mediaDir, 'audio'),
      DOCUMENT_DIR: join(this.mediaDir, 'documents'),
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async onModuleInit() {
    const b = await import('@whiskeysockets/baileys');
    this.makeWASocket = b.default;
    this.useMultiFileAuthState = b.useMultiFileAuthState;
    this.DisconnectReason = b.DisconnectReason;
    this.downloadMediaMessage = b.downloadMediaMessage;
    this.jidNormalizedUser = b.jidNormalizedUser;

    const dirs = [...Object.values(this.getMediaDirs()), this.sessionDir];
    for (const d of dirs) mkdirSync(d, { recursive: true });

    this.status.hasCredentials = existsSync(join(this.sessionDir, 'creds.json'));
    await this.start();
  }

  async onModuleDestroy() {
    this.shouldReconnect = false;
    await this.stop();
  }

  async start() {
    this.status.connection = 'connecting';
    this.status.qr = null;
    this.emitter.emit('status', { ...this.status });

    const { state, saveCreds } = await this.useMultiFileAuthState(this.sessionDir);

    this.sock = this.makeWASocket({
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
        } catch { this.logger.warn('QR generation failed'); }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === this.DisconnectReason.loggedOut;
        this.status = { ...this.status, connection: 'disconnected', me: null, hasCredentials: !loggedOut };
        this.emitter.emit('status', { ...this.status });
        if (!loggedOut && this.shouldReconnect) setTimeout(() => this.start(), 3000);
      } else if (connection === 'open') {
        this.status.connection = 'connected';
        this.status.qr = null;
        this.status.hasCredentials = true;
        this.status.me = this.sock.user
          ? { id: this.jidNormalizedUser(this.sock.user.id), name: this.sock.user.name ?? '' }
          : null;
        this.emitter.emit('status', { ...this.status });
        this.logger.log(`Connected as ${this.status.me?.id}`);
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
      if (type !== 'notify') return;
      for (const raw of messages) {
        try {
          const evt = await this.processRawMessage(raw);
          if (evt) this.emitter.emit('message', evt);
        } catch (err) {
          this.logger.error('Message processing failed', err instanceof Error ? err.message : err);
        }
      }
    });
  }

  async stop() {
    if (this.sock) {
      this.sock.ev.removeAllListeners();
      await this.sock.end(undefined).catch(() => {});
      this.sock = null;
    }
  }

  async logout() {
    this.shouldReconnect = false;
    await this.stop();
    const { rmSync } = await import('fs');
    rmSync(this.sessionDir, { recursive: true, force: true });
    mkdirSync(this.sessionDir, { recursive: true });
    this.status = { connection: 'disconnected', hasCredentials: false, me: null, qr: null };
    this.emitter.emit('status', { ...this.status });
    this.shouldReconnect = true;
  }

  // ── Status ────────────────────────────────────────────────────────────

  getStatus(): WaStatus { return { ...this.status }; }
  hasCredentials(): boolean { return this.status.hasCredentials; }

  // ── Sending ───────────────────────────────────────────────────────────

  async sendMessage(chatId: string, message: string, opts: { replyTo?: string } = {}) {
    this.assertConnected();
    const content: any = { text: message };
    if (opts.replyTo) content.quoted = { key: { id: opts.replyTo, remoteJid: chatId } };
    const result = await this.sock.sendMessage(chatId, content);
    return { success: true, messageId: result?.key?.id as string | undefined };
  }

  async sendMedia(chatId: string, filePath: string, opts: { mediaType?: string; caption?: string; fileName?: string } = {}) {
    this.assertConnected();
    if (!existsSync(filePath)) {
      const err: any = new Error('File not found'); err.code = 'FILE_NOT_FOUND'; throw err;
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

  // ── Internal ──────────────────────────────────────────────────────────

  private assertConnected() {
    if (!this.sock || this.status.connection !== 'connected') {
      const err: any = new Error('WhatsApp not connected'); err.code = 'NOT_CONNECTED'; throw err;
    }
  }

  private async processRawMessage(raw: any): Promise<WaMessage | null> {
    const key = raw.key;
    if (!key?.remoteJid || key.remoteJid === 'status@broadcast') return null;

    const chatId = key.remoteJid;
    const fromMe = !!key.fromMe;
    const msg = raw.message;
    if (!msg) return null;

    const text = msg.conversation
      ?? msg.extendedTextMessage?.text
      ?? msg.imageMessage?.caption
      ?? msg.videoMessage?.caption
      ?? msg.documentMessage?.caption
      ?? '';

    const mediaType = msg.imageMessage ? 'image'
      : msg.videoMessage ? 'video'
      : msg.audioMessage ? (msg.audioMessage.ptt ? 'ptt' : 'audio')
      : msg.documentMessage ? 'document'
      : msg.stickerMessage ? 'sticker'
      : '';

    let mediaUrls: string[] = [];
    if (mediaType) {
      try {
        const dirs = this.getMediaDirs();
        const subdir = ['image', 'sticker'].includes(mediaType) ? dirs.IMAGE_DIR
          : mediaType === 'video' ? dirs.VIDEO_DIR
          : ['audio', 'ptt'].includes(mediaType) ? dirs.AUDIO_DIR
          : dirs.DOCUMENT_DIR;
        const ext = this.mediaExtension(mediaType, msg);
        const filePath = join(subdir, `${key.id ?? Date.now()}.${ext}`);
        const buffer = await this.downloadMediaMessage(raw, 'buffer', {});
        writeFileSync(filePath, buffer as Buffer);
        mediaUrls = [filePath];
      } catch { this.logger.warn(`Media download failed for ${key.id}`); }
    }

    const isGroup = chatId.endsWith('@g.us');
    const senderId = fromMe ? (this.status.me?.id ?? 'me') : (key.participant ?? chatId);
    const senderName = fromMe ? 'You' : (raw.pushName ?? senderId.split('@')[0]);
    const chatName = isGroup ? (chatId.split('@')[0]) : (fromMe ? (this.status.me?.id?.split('@')[0] ?? 'You') : senderName);

    return {
      id: key.id ?? String(Date.now()),
      chatId, senderId, senderName, chatName, isGroup, fromMe,
      body: text || (mediaType ? `[${mediaType}]` : ''),
      hasMedia: !!mediaType, mediaType, mediaUrls,
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
      return (ext && ext.length <= 5) ? ext : 'bin';
    }
    return 'bin';
  }

  private silentLogger() {
    const noop = () => {};
    const logger: any = { level: 'silent', trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };
    logger.child = () => logger;
    return logger;
  }
}
