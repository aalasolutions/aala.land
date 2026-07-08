// land/app/controllers/whatsapp.js
import Controller from '@ember/controller';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class WhatsappController extends Controller {
  @service whatsapp;
  @service auth;

  get isCompanyAdmin() {
    return this.auth.currentUser?.role === 'company_admin';
  }

  // ── State ─────────────────────────────────────────────────────────────

  @tracked connection = 'disconnected';
  @tracked hasCredentials = false;
  @tracked me = null;
  @tracked qr = null;

  @tracked chats = [];
  @tracked messages = [];
  @tracked currentChatId = null;

  @tracked aiEnabled = false;
  @tracked aiKeyConfigured = false;
  @tracked weeklyLimit = null;
  @tracked weeklyUsed = null;
  @tracked weeklyResetsAt = null;

  @tracked messageText = '';
  @tracked isSending = false;
  @tracked errorMsg = '';

  _pollQRGeneration = 0;

  // ── Computed ──────────────────────────────────────────────────────────

  get isConnected() { return this.connection === 'connected'; }
  get showQR()      { return this.connection !== 'connected' && (!this.hasCredentials || this.qr !== null); }

  get weeklyUsageLabel() {
    if (this.weeklyLimit === null) return null;
    return `${this.weeklyUsed ?? 0}/${this.weeklyLimit}`;
  }

  get currentChatMessages() {
    if (!this.currentChatId) return [];
    return this.messages
      .filter(m => m.chatId === this.currentChatId)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  }

  get currentChatName() {
    const chat = this.chats.find(c => c.chatId === this.currentChatId);
    return chat?.chatName ?? this.currentChatId?.split('@')[0] ?? '';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async setup() {
    const setupGen = this._pollQRGeneration;
    this.whatsapp.connectSocket((type, data) => this.handleSocketEvent(type, data));

    try {
      const [connData, chatsData, msgsData, aiData] = await Promise.all([
        this.whatsapp.getConnection(),
        this.whatsapp.getChats(),
        this.whatsapp.getAllMessages(),
        this.whatsapp.getAi(),
      ]);

      if (setupGen !== this._pollQRGeneration) return; // navigated away mid-fetch

      const conn = connData.data ?? connData;
      this.connection = conn.connection ?? 'disconnected';
      this.hasCredentials = conn.hasCredentials ?? false;
      this.me = conn.me ?? null;

      this.chats = (chatsData.data?.chats ?? chatsData.chats ?? [])
        .filter(c => !this._isIgnoredChat(c))
        .map(c => ({
          ...c,
          lastTs: c.lastTs ? c.lastTs * 1000 : c.lastTs,
        }));
      this.ingestMessages(msgsData.data?.messages ?? msgsData.messages ?? []);

      const ai = aiData.data ?? aiData;
      this.aiEnabled = ai.enabled ?? false;
      this.aiKeyConfigured = ai.keyConfigured ?? false;
      this.weeklyLimit = ai.weeklyLimit ?? null;
      this.weeklyUsed = ai.weeklyUsed ?? null;
      this.weeklyResetsAt = ai.weeklyResetsAt ?? null;

      if (this.connection !== 'connected') {
        this.pollForQR();
      }

      this.startPolling();
    } catch (err) {
      console.error('WhatsApp setup failed', err);
    }
  }

  async pollForQR() {
    const myGen = ++this._pollQRGeneration;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 1500));
      if (myGen !== this._pollQRGeneration || this.connection === 'connected') return;
      try {
        const qrData = await this.whatsapp.getQR();
        const data = qrData.data ?? qrData;
        if (data.connection === 'connected') {
          this.connection = 'connected';
          this.hasCredentials = data.hasCredentials ?? true;
          this.me = data.me ?? this.me;
          this.qr = null;
          return;
        }
        if (typeof data.hasCredentials === 'boolean') this.hasCredentials = data.hasCredentials;
        if (data.qr) this.qr = data.qr;
      } catch { /* ignore */ }
    }
  }

  teardown() {
    this._pollQRGeneration++;
    this.whatsapp.disconnectSocket();
    this.stopPolling();
    this.currentChatId = null;
  }

  startPolling() {
    this.stopPolling();
    this._pollTimer = setInterval(() => this.pollUpdates(), 3000);
  }

  stopPolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }

  async pollUpdates() {
    if (!this.isConnected) return;
    try {
      if (this.currentChatId) {
        const msgsData = await this.whatsapp.getMessages(this.currentChatId);
        this.ingestMessages(msgsData.data?.messages ?? msgsData.messages ?? []);
      }
    } catch { /* ignore */ }
  }

  // ── Socket events ─────────────────────────────────────────────────────

  handleSocketEvent(type, data) {
    if (type === 'status') {
      this.connection = data.connection ?? 'disconnected';
      this.hasCredentials = data.hasCredentials ?? false;
      this.me = data.me ?? null;
      if (this.connection !== 'connected') {
        if (!this.hasCredentials) {
          this.chats = [];
          this.messages = [];
          this.currentChatId = null;
        }
        this.pollForQR();
      }
    } else if (type === 'qr') {
      this.qr = data.dataUrl ?? null;
    } else if (type === 'message') {
      this.ingestMessage(data);
    } else if (type === 'ai') {
      if (data.enabled !== undefined) this.aiEnabled = data.enabled;
      if (data.keyConfigured !== undefined) this.aiKeyConfigured = data.keyConfigured;
      if (data.weeklyUsed !== undefined) this.weeklyUsed = data.weeklyUsed;
    }
  }

  ingestMessages(msgs) {
    const existingIds = new Set(this.messages.map(m => m.id));
    const newMsgs = msgs
      .filter(m => !existingIds.has(m.id))
      .filter(m => m.body || m.hasMedia)
      .filter(m => !this._isIgnoredChat(m))
      .map(m => ({ ...m, timestamp: m.timestamp ? m.timestamp * 1000 : m.timestamp }));
    if (!newMsgs.length) return;
    this.messages = [...this.messages, ...newMsgs];
    for (const m of newMsgs) this._updateChat(m);
  }

  ingestMessage(msg) {
    if (this.messages.some(m => m.id === msg.id)) return;
    if (!msg.body && !msg.hasMedia) return;
    if (this._isIgnoredChat(msg)) return;
    const normalized = { ...msg, timestamp: msg.timestamp ? msg.timestamp * 1000 : msg.timestamp };
    this.messages = [...this.messages, normalized];
    this._updateChat(normalized);
  }

  _isIgnoredChat(msg) {
    if (msg.isGroup) return true;
    if (this.me?.id && msg.chatId === this.me.id) return true;
    if (msg.chatId?.endsWith('@newsletter')) return true;
    return false;
  }

  _updateChat(msg) {
    const existingIdx = this.chats.findIndex(c => c.chatId === msg.chatId);
    const isNewer = (msg.timestamp ?? 0) >= (this.chats[existingIdx]?.lastTs ?? 0);
    if (existingIdx >= 0 && isNewer) {
      const updated = [...this.chats];
      updated[existingIdx] = {
        ...updated[existingIdx],
        lastBody: msg.body,
        lastTs: msg.timestamp,
        lastFromMe: msg.fromMe,
      };
      this.chats = updated.sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0));
    } else if (existingIdx < 0) {
      this.chats = [{
        chatId: msg.chatId,
        chatName: msg.chatName || msg.chatId.split('@')[0],
        isGroup: msg.isGroup ?? false,
        lastBody: msg.body,
        lastTs: msg.timestamp,
        lastFromMe: msg.fromMe,
      }, ...this.chats];
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────

  @action
  selectChat(chatId) {
    this.currentChatId = chatId;
    this.errorMsg = '';
  }

  @action
  setMessageText(event) {
    this.messageText = event.target.value;
  }

  @action
  async sendMessage(event) {
    if (event) event.preventDefault();
    const text = this.messageText.trim();
    if (!text || !this.currentChatId || this.isSending) return;

    this.isSending = true;
    this.errorMsg = '';
    const tempId = `pending-${Date.now()}`;
    const prevChat = this.chats.find(c => c.chatId === this.currentChatId);

    this.ingestMessage({
      id: tempId,
      chatId: this.currentChatId,
      senderId: this.me?.id ?? 'me',
      senderName: 'You',
      chatName: this.currentChatName,
      isGroup: this.currentChatId.endsWith('@g.us'),
      body: text,
      hasMedia: false, mediaType: '', mediaUrls: [],
      mentionedIds: [], quotedParticipant: '',
      fromMe: true, aiGenerated: false,
      timestamp: Math.floor(Date.now() / 1000),
    });
    this.messageText = '';

    try {
      const result = await this.whatsapp.sendMessage(this.currentChatId, text);
      const realId = (result.data ?? result).messageId;
      if (realId) {
        const alreadyPresent = this.messages.some(m => m.id === realId);
        this.messages = alreadyPresent
          ? this.messages.filter(m => m.id !== tempId)
          : this.messages.map(m => m.id === tempId ? { ...m, id: realId } : m);
      }
    } catch (err) {
      this.messages = this.messages.filter(m => m.id !== tempId);
      if (prevChat) {
        const idx = this.chats.findIndex(c => c.chatId === this.currentChatId);
        if (idx >= 0) {
          const updated = [...this.chats];
          updated[idx] = prevChat;
          this.chats = updated.sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0));
        }
      }
      this.errorMsg = 'Send failed. Please try again.';
    } finally {
      this.isSending = false;
    }
  }

  @action
  handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage(null);
    }
  }

  @action
  async toggleAi() {
    if (!this.aiKeyConfigured) return;
    try {
      const result = await this.whatsapp.toggleAi(!this.aiEnabled);
      this.aiEnabled = (result.data ?? result).enabled ?? this.aiEnabled;
    } catch { /* gateway will emit ai-status */ }
  }

  @action
  async repairWhatsapp() {
    if (!confirm('Re-pair your WhatsApp? Your current session will be cleared.')) return;
    try {
      await this.whatsapp.logout();
      this.messages = [];
      this.chats = [];
      this.currentChatId = null;
      this.connection = 'disconnected';
      this.hasCredentials = false;
      this.qr = null;
      this._pollQRGeneration++;
      this.pollForQR();
    } catch (err) {
      this.errorMsg = 'Re-pair failed.';
    }
  }

  mediaUrl(msg) {
    if (!msg.hasMedia || !msg.mediaUrls?.[0]) return null;
    return this.whatsapp.mediaUrl(msg.mediaType, msg.mediaUrls[0]);
  }
}
