// land/app/controllers/whatsapp.js
import Controller from '@ember/controller';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

// Meta opens the free-form reply window on an inbound customer message only, and
// it runs 24h from that message. An agent replying never extends it.
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

// Fields a later delivery of the same wa message id may legitimately change.
const MUTABLE_MESSAGE_FIELDS = [
  'body',
  'status',
  'statusAt',
  'errorCode',
  'editedAt',
  'deletedAt',
];

const CONNECTION_COPY = {
  none: {
    label: 'No number connected',
    variant: 'secondary',
    detail:
      'Connecting a WhatsApp number is part of onboarding and is not available yet.',
  },
  pending: {
    label: 'Connection pending',
    variant: 'warning',
    detail: 'Meta has not finished setting this number up yet.',
  },
  connected: {
    label: 'Connected',
    variant: 'success',
    detail: '',
  },
  disconnected: {
    label: 'Disconnected',
    variant: 'danger',
    detail: 'This number is no longer linked. Reconnect it to send again.',
  },
  flagged: {
    label: 'Flagged by Meta',
    variant: 'danger',
    detail:
      'Meta has flagged this number for quality. Sending may be restricted.',
  },
};

// Coarse on purpose: the operator needs "plenty of time" or "almost gone", not seconds.
function formatRemaining(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return 'under a minute';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 1) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

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

  @tracked connection = null;
  // Bumped on every poll tick so the reply-window countdown stays honest.
  @tracked now = Date.now();

  @tracked aiEnabled = false;
  @tracked aiKeyConfigured = false;
  @tracked creditsLimit = null;
  @tracked creditsUsed = null;
  @tracked creditsResetsAt = null;
  @tracked openWindows = null;

  @tracked messageText = '';
  @tracked isSending = false;

  _setupGeneration = 0;
  _pollTimer = null;
  _pollInFlight = false;

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

  get currentChat() {
    if (!this.currentChatId) return null;
    return this.chats.find((c) => c.chatId === this.currentChatId) ?? null;
  }

  get currentChatName() {
    return (
      this.currentChat?.chatName ?? this.currentChatId?.split('@')[0] ?? ''
    );
  }

  // ── Connection ────────────────────────────────────────────────────────

  get connectionStatus() {
    return this.connection?.status ?? 'none';
  }

  get isConnected() {
    return this.connectionStatus === 'connected';
  }

  get connectionLabel() {
    return (CONNECTION_COPY[this.connectionStatus] ?? CONNECTION_COPY.none)
      .label;
  }

  get connectionVariant() {
    return (CONNECTION_COPY[this.connectionStatus] ?? CONNECTION_COPY.none)
      .variant;
  }

  // A disconnect reason from Meta beats our generic copy: it says WHY.
  get connectionDetail() {
    if (this.connectionStatus === 'connected') {
      return this.connection?.displayPhoneNumber ?? '';
    }
    if (
      this.connectionStatus === 'disconnected' &&
      this.connection?.disconnectReason
    ) {
      return `Meta reported ${this.connection.disconnectReason}.`;
    }
    return (CONNECTION_COPY[this.connectionStatus] ?? CONNECTION_COPY.none)
      .detail;
  }

  // ── Reply window ──────────────────────────────────────────────────────

  // Null when no chat is open. Otherwise always an object, because a chat the
  // customer has never written in still needs to read as closed, not as unknown.
  get replyWindow() {
    if (!this.currentChatId) return null;

    const openedAt = this.currentChat?.lastInboundAt ?? null;
    if (!openedAt) {
      return {
        open: false,
        everOpened: false,
        remainingMs: 0,
        label: 'Reply window closed',
        detail: 'The customer has not written yet, so no window is open.',
      };
    }

    const remainingMs = openedAt + REPLY_WINDOW_MS - this.now;
    if (remainingMs <= 0) {
      return {
        open: false,
        everOpened: true,
        remainingMs: 0,
        label: 'Reply window closed',
        detail: 'Free-form replies need a new message from the customer.',
      };
    }

    return {
      open: true,
      everOpened: true,
      remainingMs,
      label: `Reply window closes in ${formatRemaining(remainingMs)}`,
      detail: '',
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async setup() {
    const setupGen = this._setupGeneration;
    this.whatsapp.connectSocket((type, data) =>
      this.handleSocketEvent(type, data),
    );

    try {
      const [chatsData, msgsData, aiData, connData] = await Promise.all([
        this.whatsapp.getChats(),
        this.whatsapp.getAllMessages(),
        this.whatsapp.getAi(),
        // Own catch: a connection read failure must not blank the chat list.
        this.whatsapp.getConnection().catch(() => null),
      ]);

      if (setupGen !== this._setupGeneration) return; // navigated away mid-fetch

      this.connection = connData ? (connData.data ?? connData) : null;

      this.chats = (chatsData.data?.chats ?? chatsData.chats ?? [])
        .filter((c) => !this._isIgnoredChat(c))
        .map((c) => this._normalizeChat(c));
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
    this._pollInFlight = false;
  }

  async pollUpdates() {
    // Ahead of the guards: the countdown must keep moving even between fetches.
    this.now = Date.now();
    if (!this.currentChatId) return;
    // setInterval does not wait for the previous tick, so a response slower than
    // the interval would otherwise stack a second request on top of the first.
    if (this._pollInFlight) return;

    this._pollInFlight = true;
    try {
      const msgsData = await this.whatsapp.getMessages(this.currentChatId);
      this.ingestMessages(msgsData.data?.messages ?? msgsData.messages ?? []);
    } catch {
      /* ignore */
    } finally {
      this._pollInFlight = false;
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

  // A deleted message keeps its row but loses its body, so it must survive the
  // body/hasMedia filter that drops empty system rows.
  _isRenderable(msg) {
    return Boolean(msg.body || msg.hasMedia || msg.deletedAt);
  }

  _normalizeMessage(msg) {
    return {
      ...msg,
      timestamp: msg.timestamp ? msg.timestamp * 1000 : msg.timestamp,
    };
  }

  _normalizeChat(chat) {
    return {
      ...chat,
      lastTs: chat.lastTs ? chat.lastTs * 1000 : chat.lastTs,
      lastInboundAt: chat.lastInboundAt ? chat.lastInboundAt * 1000 : null,
    };
  }

  // Returns the merged row when a later delivery of the same id changed a
  // mutable field, and null when there is nothing to write. Delivery status,
  // edits and deletions all arrive on an id we already hold, so dropping every
  // known id (the old behaviour) froze a message at whatever it looked like the
  // first time we saw it.
  _mergeExisting(existing, incoming) {
    let changed = false;
    const merged = { ...existing };
    for (const field of MUTABLE_MESSAGE_FIELDS) {
      const next = incoming[field] ?? null;
      if (next !== null && next !== (existing[field] ?? null)) {
        merged[field] = next;
        changed = true;
      }
    }
    return changed ? merged : null;
  }

  ingestMessages(msgs) {
    const byId = new Map(this.messages.map((m) => [m.id, m]));
    const appended = [];
    const chatTouched = [];
    let changed = false;

    for (const raw of msgs) {
      if (!this._isRenderable(raw) || this._isIgnoredChat(raw)) continue;
      const normalized = this._normalizeMessage(raw);
      const existing = byId.get(normalized.id);

      if (!existing) {
        byId.set(normalized.id, normalized);
        appended.push(normalized);
        chatTouched.push(normalized);
        changed = true;
        continue;
      }

      const merged = this._mergeExisting(existing, normalized);
      if (merged) {
        byId.set(merged.id, merged);
        changed = true;
      }
    }

    if (!changed) return;
    // Rebuild in place so an updated row keeps its position in the thread.
    this.messages = [
      ...this.messages.map((m) => byId.get(m.id) ?? m),
      ...appended,
    ];
    for (const m of chatTouched) this._updateChat(m);
  }

  ingestMessage(msg) {
    if (!this._isRenderable(msg)) return;
    if (this._isIgnoredChat(msg)) return;
    const normalized = this._normalizeMessage(msg);
    const existing = this.messages.find((m) => m.id === normalized.id);

    if (existing) {
      const merged = this._mergeExisting(existing, normalized);
      if (merged) {
        this.messages = this.messages.map((m) =>
          m.id === merged.id ? merged : m,
        );
      }
      return;
    }

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
    // An inbound message reopens Meta's window; an outbound one never does.
    const inboundAt = msg.fromMe ? null : (msg.timestamp ?? null);

    if (existingIdx >= 0 && isNewer) {
      const updated = [...this.chats];
      const current = updated[existingIdx];
      updated[existingIdx] = {
        ...current,
        lastBody: msg.body,
        lastTs: msg.timestamp,
        lastFromMe: msg.fromMe,
        lastInboundAt:
          Math.max(inboundAt ?? 0, current.lastInboundAt ?? 0) || null,
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
          lastInboundAt: inboundAt,
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
