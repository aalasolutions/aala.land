// frontend/app/controllers/whatsapp.js
import Controller from '@ember/controller';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class WhatsappController extends Controller {
  @service whatsapp;

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

  @tracked messageText = '';
  @tracked isSending = false;
  @tracked errorMsg = '';

  // ── Computed ──────────────────────────────────────────────────────────

  get isConnected() { return this.connection === 'connected'; }
  get showQR()      { return this.connection !== 'connected' && !this.hasCredentials; }

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
    this.whatsapp.connectSocket((type, data) => this.handleSocketEvent(type, data));

    try {
      const [connData, chatsData, msgsData, aiData] = await Promise.all([
        this.whatsapp.getConnection(),
        this.whatsapp.getChats(),
        this.whatsapp.getAllMessages(),
        this.whatsapp.getAi(),
      ]);

      const conn = connData.data ?? connData;
      this.connection = conn.connection ?? 'disconnected';
      this.hasCredentials = conn.hasCredentials ?? false;
      this.me = conn.me ?? null;

      this.chats = (chatsData.data?.chats ?? chatsData.chats ?? []);
      this.ingestMessages(msgsData.data?.messages ?? msgsData.messages ?? []);

      const ai = aiData.data ?? aiData;
      this.aiEnabled = ai.enabled ?? false;
      this.aiKeyConfigured = ai.keyConfigured ?? false;

      if (this.connection !== 'connected' && !this.hasCredentials) {
        const qrData = await this.whatsapp.getQR();
        this.qr = (qrData.data ?? qrData).qr ?? null;
      }
    } catch (err) {
      console.error('WhatsApp setup failed', err);
    }
  }

  teardown() {
    this.whatsapp.disconnectSocket();
  }

  // ── Socket events ─────────────────────────────────────────────────────

  handleSocketEvent(type, data) {
    if (type === 'status') {
      this.connection = data.connection ?? 'disconnected';
      this.hasCredentials = data.hasCredentials ?? false;
      this.me = data.me ?? null;
    } else if (type === 'qr') {
      this.qr = data.dataUrl ?? null;
    } else if (type === 'message') {
      this.ingestMessage(data);
    } else if (type === 'ai') {
      this.aiEnabled = data.enabled ?? false;
      this.aiKeyConfigured = data.keyConfigured ?? false;
    }
  }

  ingestMessages(msgs) {
    for (const m of msgs) this.ingestMessage(m);
  }

  ingestMessage(msg) {
    if (this.messages.some(m => m.id === msg.id)) return;
    this.messages = [...this.messages, msg];

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
        this.messages = this.messages.map(m => m.id === tempId ? { ...m, id: realId } : m);
      }
    } catch (err) {
      this.messages = this.messages.filter(m => m.id !== tempId);
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
    } catch (err) {
      this.errorMsg = 'Re-pair failed.';
    }
  }

  mediaUrl(msg) {
    if (!msg.hasMedia || !msg.mediaUrls?.[0]) return null;
    return this.whatsapp.mediaUrl(msg.mediaType, msg.mediaUrls[0]);
  }
}
