// land/app/controllers/whatsapp.js
import Controller from '@ember/controller';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class WhatsappController extends Controller {
  @service whatsapp;
  @service auth;
  @service notifications;

  get isCompanyAdmin() {
    return this.auth.currentUser?.role === 'company_admin';
  }

  // ── State ─────────────────────────────────────────────────────────────

  @tracked chats = [];
  @tracked messages = [];
  @tracked currentChatId = null;

  @tracked aiEnabled = false;
  @tracked aiKeyConfigured = false;
  @tracked creditsLimit = null;
  @tracked creditsUsed = null;
  @tracked creditsResetsAt = null;
  @tracked openWindows = null;

  @tracked messageText = '';
  @tracked isSending = false;

  _setupGeneration = 0;

  // ── Computed ──────────────────────────────────────────────────────────

  get creditUsageLabel() {
    if (this.creditsLimit === null) return null;
    return `${this.creditsUsed ?? 0}/${this.creditsLimit} AI credits`;
  }

  get composerDisabled() {
    return !this.currentChatId || this.isSending;
  }

  get currentChatMessages() {
    if (!this.currentChatId) return [];
    return this.messages
      .filter((m) => m.chatId === this.currentChatId)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  }

  get currentChatName() {
    const chat = this.chats.find((c) => c.chatId === this.currentChatId);
    return chat?.chatName ?? this.currentChatId?.split('@')[0] ?? '';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async setup() {
    const setupGen = this._setupGeneration;
    this.whatsapp.connectSocket((type, data) =>
      this.handleSocketEvent(type, data),
    );

    try {
      const [chatsData, msgsData, aiData] = await Promise.all([
        this.whatsapp.getChats(),
        this.whatsapp.getAllMessages(),
        this.whatsapp.getAi(),
      ]);

      if (setupGen !== this._setupGeneration) return; // navigated away mid-fetch

      this.chats = (chatsData.data?.chats ?? chatsData.chats ?? [])
        .filter((c) => !this._isIgnoredChat(c))
        .map((c) => ({
          ...c,
          lastTs: c.lastTs ? c.lastTs * 1000 : c.lastTs,
        }));
      this.ingestMessages(msgsData.data?.messages ?? msgsData.messages ?? []);

      const ai = aiData.data ?? aiData;
      this.aiEnabled = ai.enabled ?? false;
      this.aiKeyConfigured = ai.keyConfigured ?? false;
      this.creditsLimit = ai.creditsLimit ?? null;
      this.creditsUsed = ai.creditsUsed ?? null;
      this.creditsResetsAt = ai.creditsResetsAt ?? null;
      this.openWindows = ai.openWindows ?? null;

      this.startPolling();
    } catch (err) {
      console.error('WhatsApp setup failed', err);
    }
  }

  teardown() {
    this._setupGeneration++;
    this.whatsapp.disconnectSocket();
    this.stopPolling();
    this.currentChatId = null;
  }

  startPolling() {
    this.stopPolling();
    this._pollTimer = setInterval(() => this.pollUpdates(), 3000);
  }

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async pollUpdates() {
    if (!this.currentChatId) return;
    try {
      const msgsData = await this.whatsapp.getMessages(this.currentChatId);
      this.ingestMessages(msgsData.data?.messages ?? msgsData.messages ?? []);
    } catch {
      /* ignore */
    }
  }

  // ── Socket events ─────────────────────────────────────────────────────

  handleSocketEvent(type, data) {
    if (type === 'message') {
      this.ingestMessage(data);
    } else if (type === 'ai') {
      if (data.enabled !== undefined) this.aiEnabled = data.enabled;
      if (data.keyConfigured !== undefined)
        this.aiKeyConfigured = data.keyConfigured;
      if (data.creditsUsed !== undefined) this.creditsUsed = data.creditsUsed;
      if (data.creditsLimit !== undefined)
        this.creditsLimit = data.creditsLimit;
      if (data.openWindows !== undefined) this.openWindows = data.openWindows;
    }
  }

  ingestMessages(msgs) {
    const existingIds = new Set(this.messages.map((m) => m.id));
    const newMsgs = msgs
      .filter((m) => !existingIds.has(m.id))
      .filter((m) => m.body || m.hasMedia)
      .filter((m) => !this._isIgnoredChat(m))
      .map((m) => ({
        ...m,
        timestamp: m.timestamp ? m.timestamp * 1000 : m.timestamp,
      }));
    if (!newMsgs.length) return;
    this.messages = [...this.messages, ...newMsgs];
    for (const m of newMsgs) this._updateChat(m);
  }

  ingestMessage(msg) {
    if (this.messages.some((m) => m.id === msg.id)) return;
    if (!msg.body && !msg.hasMedia) return;
    if (this._isIgnoredChat(msg)) return;
    const normalized = {
      ...msg,
      timestamp: msg.timestamp ? msg.timestamp * 1000 : msg.timestamp,
    };
    this.messages = [...this.messages, normalized];
    this._updateChat(normalized);
  }

  _isIgnoredChat(msg) {
    if (msg.isGroup) return true;
    if (msg.chatId?.endsWith('@newsletter')) return true;
    return false;
  }

  _updateChat(msg) {
    const existingIdx = this.chats.findIndex((c) => c.chatId === msg.chatId);
    const isNewer =
      (msg.timestamp ?? 0) >= (this.chats[existingIdx]?.lastTs ?? 0);
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
      this.chats = [
        {
          chatId: msg.chatId,
          chatName: msg.chatName || msg.chatId.split('@')[0],
          isGroup: msg.isGroup ?? false,
          lastBody: msg.body,
          lastTs: msg.timestamp,
          lastFromMe: msg.fromMe,
        },
        ...this.chats,
      ];
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────

  @action
  selectChat(chatId) {
    this.currentChatId = chatId;
  }

  // Kit form components call onInput as (value, event), unlike a raw input event.
  @action
  setMessageText(value) {
    this.messageText = value;
  }

  @action
  async sendMessage(event) {
    if (event) event.preventDefault();
    const body = this.messageText.trim();
    if (!body || this.composerDisabled) return;

    this.isSending = true;
    try {
      const result = await this.whatsapp.sendMessage(this.currentChatId, body);
      // Same path the socket handler uses, so the later whatsapp:message echo
      // for this id is deduped instead of appended twice.
      this.ingestMessage(result.data ?? result);
      this.messageText = '';
    } catch (err) {
      this.notifications.error(err.message);
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
    } catch {
      /* gateway will emit ai-status */
    }
  }
}
