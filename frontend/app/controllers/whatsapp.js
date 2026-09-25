import Controller from '@ember/controller';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { runTask, cancelTask } from 'ember-lifeline';
import { modifier } from 'ember-modifier';
import {
  disconnectReasonText,
  isTokenInvalidReason,
} from 'land/utils/whatsapp-disconnect-reasons';
import { REPLY_WINDOW_MS, formatRemaining } from 'land/utils/reply-window';

const PAGE_SIZE = 50;
const AROUND_LIMIT = 100;
const SAVE_THROTTLE_MS = 500;
const LOAD_OLDER_THRESHOLD_PX = 40;
const LOAD_NEWER_THRESHOLD_PX = 40;
const STICK_TO_BOTTOM_PX = 80;
const MARKER_TOP_OFFSET_PX = 24;
const READ_VISIBLE_RATIO = 0.6;

// Fields a later delivery of the same wa message id may legitimately change.
const MUTABLE_MESSAGE_FIELDS = [
  'body',
  'status',
  'statusAt',
  'errorCode',
  'editedAt',
  'deletedAt',
];

const HISTORY_SYNC_COPY = {
  requested: () => 'Syncing chat history...',
  in_progress: (progress) => `Syncing chat history... ${progress ?? 0}%`,
  declined: () =>
    'Chat history sharing is turned off in the WhatsApp Business app',
  failed: () => 'Chat history could not be synced',
};

const CONNECTION_COPY = {
  none: {
    label: 'No number connected',
    variant: 'secondary',
    detail: 'Connect your WhatsApp Business number to send and receive here.',
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

export default class WhatsappController extends Controller {
  @service whatsapp;
  @service auth;
  @service notifications;
  @service embeddedSignup;
  @service session;

  get isCompanyAdmin() {
    return this.auth.currentUser?.role === 'company_admin';
  }

  get canToggleAi() {
    return this.isCompanyAdmin && this.aiKeyConfigured;
  }

  get aiToggleTooltip() {
    if (!this.isCompanyAdmin) return 'Only Company Admin can toggle AI';
    return this.aiKeyConfigured
      ? 'Toggle AI auto-reply'
      : 'No AI key configured';
  }


  @tracked chats = [];
  @tracked currentChatId = null;
  // chatId to thread state; replaced on write.
  @tracked threads = new Map();
  // Divider position for this visit; not moved live.
  @tracked unreadMarkerId = null;

  @tracked connection = null;
  @tracked signupConfig = null;
  @tracked isConnecting = false;
  @tracked isDisconnectConfirmOpen = false;
  // Bumped by a local 60s clock so the reply-window countdown stays honest.
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
  _clockTimer = null;
  _saveTimer = null;
  _requestSeq = 0;
  _readObserver = null;
  _visibleReadRows = new Set();
  // Live messages during a load.
  _pendingLive = [];
  _owedReloadChatId = null;
  _onVisibilityChange = () => this._markVisibleRead();

  // Stable refs for off().
  _socketHandlers = {
    message: (data) => this.ingestMessage(data),
    status: (data) => this.applyStatus(data),
    ai: (data) => this.applyAi(data),
    chats: (chats) => this.applyResyncChats(chats),
    history: (data) => this.applyHistorySync(data),
    connection: () => this._refreshConnection(),
  };


  get creditUsageLabel() {
    if (this.creditsLimit === null) return null;
    return `${this.creditsUsed ?? 0}/${this.creditsLimit} AI credits`;
  }

  get composerDisabled() {
    return !this.currentChatId || this.isSending || !this.isConnected;
  }

  get currentThread() {
    return this.currentChatId
      ? (this.threads.get(this.currentChatId) ?? null)
      : null;
  }

  get currentChatMessages() {
    return this.currentThread?.messages ?? [];
  }

  get currentChatLoadingWindow() {
    return this.currentThread?.loading === 'window';
  }

  get currentChatLoadingOlder() {
    return this.currentThread?.loading === 'older';
  }

  get currentChatOlderError() {
    return Boolean(this.currentThread?.error);
  }

  get currentChatLoadingNewer() {
    return this.currentThread?.loading === 'newer';
  }

  get currentChatNewerError() {
    return Boolean(this.currentThread?.newerError);
  }

  get currentChatWindowError() {
    return Boolean(this.currentThread?.windowError);
  }

  get currentChat() {
    if (!this.currentChatId) return null;
    return this.chats.find((c) => c.chatId === this.currentChatId) ?? null;
  }

  get currentChatName() {
    return this.currentChat?.chatName ?? this.currentChatId ?? '';
  }

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
      return disconnectReasonText(this.connection.disconnectReason);
    }
    if (this.needsReauth) {
      return disconnectReasonText(this.connection.disconnectReason);
    }
    return (CONNECTION_COPY[this.connectionStatus] ?? CONNECTION_COPY.none)
      .detail;
  }

  get historySyncText() {
    const copy = HISTORY_SYNC_COPY[this.connection?.historySyncStatus];
    return copy ? copy(this.connection.historySyncProgress) : '';
  }

  applyHistorySync(data) {
    if (!this.connection || !data?.status) return;
    this.connection = {
      ...this.connection,
      historySyncStatus: data.status,
      historySyncProgress: data.progress ?? null,
    };
  }

  // A dead token is stored as FLAGGED, not DISCONNECTED, so Meta keeps delivering inbound.
  get needsReauth() {
    return (
      this.connectionStatus === 'flagged' &&
      isTokenInvalidReason(this.connection?.disconnectReason)
    );
  }

  get needsConnect() {
    const status = this.connectionStatus;
    return status === 'none' || status === 'disconnected' || this.needsReauth;
  }

  get signupReady() {
    return Boolean(
      this.session.whatsappConfigured &&
        this.signupConfig?.appId &&
        this.signupConfig?.configId,
    );
  }

  get connectButtonText() {
    return this.connection ? 'Reconnect' : 'Connect WhatsApp';
  }

  get connectDisabled() {
    return !this.signupReady;
  }

  get connectTooltip() {
    if (this.signupReady) return null;
    if (!this.session.whatsappConfigured) {
      return 'WhatsApp is not configured. Check system variables or contact your admin.';
    }
    return 'WhatsApp signup is not configured on this server yet';
  }

  // Null when no chat is open; otherwise an object so an unwritten chat reads as closed, not unknown.
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

    const closesAt = new Date(openedAt + REPLY_WINDOW_MS).toLocaleTimeString(
      [],
      { hour: 'numeric', minute: '2-digit' },
    );
    return {
      open: true,
      everOpened: true,
      remainingMs,
      label: `Reply window closes in ${formatRemaining(remainingMs)} (at ${closesAt})`,
      detail: '',
    };
  }

  async setup() {
    const setupGen = this._setupGeneration;
    this.threads = new Map();
    this.startClock();
    for (const [type, fn] of Object.entries(this._socketHandlers)) {
      this.whatsapp.on(type, fn);
    }
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    const seedTicket = this.whatsapp.beginUnreadSeed();

    try {
      const [chatsData, aiData, connData, signupData] = await Promise.all([
        this.whatsapp.getChats(),
        this.whatsapp.getAi(),
        // Keeps the chat list on failure.
        this.whatsapp.getConnection().catch(() => null),
        this.whatsapp.getSignupConfig().catch(() => null),
      ]);

      if (setupGen !== this._setupGeneration) return; // navigated away mid-fetch

      this.connection = connData?.data ?? null;
      this.signupConfig = signupData ? (signupData.data ?? signupData) : null;

      const chats = chatsData.data?.chats ?? chatsData.chats ?? [];
      this.whatsapp.seedUnread(chats, seedTicket);
      this._setChats(chats);

      const ai = aiData.data ?? aiData;
      this.aiEnabled = ai.enabled ?? false;
      this.aiKeyConfigured = ai.keyConfigured ?? false;
      this.creditsLimit = ai.creditsLimit ?? null;
      this.creditsUsed = ai.creditsUsed ?? null;
      this.creditsResetsAt = ai.creditsResetsAt ?? null;
      this.openWindows = ai.openWindows ?? null;
    } catch (err) {
      console.error('WhatsApp setup failed', err);
      this.notifications.error('Could not load WhatsApp data');
      return;
    }

    const saved = this.whatsapp.readLastChat();
    if (saved && this.chats.some((c) => c.chatId === saved.chatId)) {
      await this._openChat(saved.chatId, { restore: saved });
    }
  }

  teardown() {
    this._setupGeneration++;
    this._cancelSave();
    this._saveLastChat();
    for (const [type, fn] of Object.entries(this._socketHandlers)) {
      this.whatsapp.off(type, fn);
    }
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this.stopClock();
    this._disconnectReadObserver();
    this.currentChatId = null;
    this.whatsapp.activeChatId = null;
    this.unreadMarkerId = null;
    this.threads = new Map();
    this._pendingLive = [];
    this._owedReloadChatId = null;
  }

  startClock() {
    this.stopClock();
    this.now = Date.now();
    this._clockTimer = setInterval(() => (this.now = Date.now()), 60000);
  }

  stopClock() {
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
    }
  }

  _setThread(chatId, state) {
    const next = new Map(this.threads);
    if (state) next.set(chatId, state);
    else next.delete(chatId);
    this.threads = next;
  }

  _pageMessages(raw) {
    return raw
      .filter((m) => this._isRenderable(m) && !this._isIgnoredChat(m))
      .map((m) => this._normalizeMessage(m));
  }

  _isRequest(chatId, requestId) {
    return this.threads.get(chatId)?.requestId === requestId;
  }

  // Returns 'ok', 'gone', 'failed' or 'stale'.
  async loadWindow(chatId, { around = null } = {}) {
    const state = this.threads.get(chatId);
    const requestId = ++this._requestSeq;
    if (chatId === this.currentChatId) this._pendingLive = [];
    this._setThread(chatId, {
      messages: state?.messages ?? [],
      oldestId: state?.oldestId ?? null,
      newestId: state?.newestId ?? null,
      hasMore: state?.hasMore ?? false,
      hasMoreNewer: state?.hasMoreNewer ?? false,
      requestId,
      loading: 'window',
      error: false,
      newerError: false,
      windowError: Boolean(state?.windowError),
    });
    try {
      const result = await this.whatsapp.getMessages(
        chatId,
        around ? { around, limit: AROUND_LIMIT } : { limit: PAGE_SIZE },
      );
      if (!this._isRequest(chatId, requestId)) return 'stale';
      const data = result?.data ?? result ?? {};
      const raw = data.messages ?? [];
      const got = raw.length > 0;
      const hasMoreNewer = Boolean(around && got && data.hasMoreNewer);
      let messages = this._pageMessages(raw);
      let newestId = raw.at(-1)?.id ?? null;
      if (!hasMoreNewer) {
        ({ messages, newestId } = this._withPendingLive(messages, newestId));
      }
      this._setThread(chatId, {
        messages,
        oldestId: raw[0]?.id ?? null,
        newestId,
        hasMore: got && Boolean(around ? data.hasMoreOlder : data.hasMore),
        hasMoreNewer,
        requestId,
        loading: null,
        error: false,
        newerError: false,
        windowError: false,
      });
      return 'ok';
    } catch (err) {
      if (!this._isRequest(chatId, requestId)) return 'stale';
      const gone = Boolean(around) && err?.status === 400;
      const kept = state?.messages.length > 0;
      if (kept) {
        this._keepWindow(chatId, state, requestId, !gone);
      } else {
        this._setThread(chatId, null);
      }
      if (gone) return 'gone';
      if (this._owedReloadChatId === chatId) this._owedReloadChatId = null;
      console.error('WhatsApp messages load failed', err);
      if (!kept) this.notifications.error('Could not load messages');
      return 'failed';
    }
  }

  _keepWindow(chatId, state, requestId, failed) {
    let messages = this.threads.get(chatId).messages;
    let newestId = state.newestId;
    if (!state.hasMoreNewer) {
      ({ messages, newestId } = this._withPendingLive(messages, newestId));
    }
    this._setThread(chatId, {
      ...state,
      messages,
      newestId,
      requestId,
      loading: null,
      windowError: failed || Boolean(state.windowError),
    });
  }

  // Returns true when an edge page was applied.
  async loadEdgePage(chatId, { older = false } = {}) {
    const state = this.threads.get(chatId);
    if (!state || state.loading) return false;
    if (older && (!state.hasMore || !state.oldestId)) return false;
    if (!older && (!state.hasMoreNewer || !state.newestId)) return false;

    const requestId = ++this._requestSeq;
    if (!older && chatId === this.currentChatId) this._pendingLive = [];
    this._setThread(chatId, {
      ...state,
      requestId,
      loading: older ? 'older' : 'newer',
    });
    try {
      const result = await this.whatsapp.getMessages(
        chatId,
        older
          ? { before: state.oldestId, limit: PAGE_SIZE }
          : { after: state.newestId, limit: PAGE_SIZE },
      );
      if (!this._isRequest(chatId, requestId)) return false;
      // Built on the latest thread.
      const current = this.threads.get(chatId);
      const data = result?.data ?? result ?? {};
      const raw = data.messages ?? [];
      const got = raw.length > 0;
      const held = new Set(current.messages.map((m) => m.id));
      const page = this._pageMessages(raw).filter((m) => !held.has(m.id));
      let next;
      if (older) {
        next = {
          ...current,
          messages: [...page, ...current.messages],
          oldestId: raw[0]?.id ?? current.oldestId,
          hasMore: got && Boolean(data.hasMore),
          error: false,
        };
      } else {
        const hasMoreNewer = got && Boolean(data.hasMore);
        let messages = [...current.messages, ...page];
        let newestId = raw.at(-1)?.id ?? current.newestId;
        if (!hasMoreNewer) {
          ({ messages, newestId } = this._withPendingLive(messages, newestId));
        }
        next = {
          ...current,
          messages,
          newestId,
          hasMoreNewer,
          newerError: false,
        };
      }
      this._setThread(chatId, { ...next, loading: null });
      return true;
    } catch (err) {
      console.error('WhatsApp messages load failed', err);
      if (this._isRequest(chatId, requestId)) {
        // Edge failures show a retry row.
        const flag = older ? 'error' : 'newerError';
        const current = this.threads.get(chatId);
        this._setThread(chatId, { ...current, loading: null, [flag]: true });
      }
      return false;
    }
  }

  // Adds live messages after a load.
  _withPendingLive(messages, newestId) {
    const pending = this._pendingLive;
    this._pendingLive = [];
    if (!pending.length) return { messages, newestId };
    const held = new Set(messages.map((m) => m.id));
    const extra = pending.filter((m) => !held.has(m.id));
    if (!extra.length) return { messages, newestId };
    return {
      messages: [...messages, ...extra],
      newestId: extra.at(-1).id,
    };
  }

  // Reconnect: refresh open chat.
  // A resync means pushes may have been missed, the history sync state included.
  async applyResyncChats(chats) {
    this._setChats(chats);
    this._refreshConnection();
    if (this.currentChatId) await this._reloadWindow(this.currentChatId);
  }

  async _refreshConnection() {
    const setupGen = this._setupGeneration;
    // Every other writer assigns a new object, so a changed reference means newer state landed.
    const before = this.connection;
    try {
      const connData = await this.whatsapp.getConnection();
      if (setupGen !== this._setupGeneration || this.connection !== before) {
        return;
      }
      this.connection = connData?.data ?? null;
    } catch {
      // The card keeps its last known state.
    }
  }

  async _reloadWindow(chatId) {
    const thread = this.threads.get(chatId);
    // The open or restore load owns the window.
    if (thread?.loading === 'window') {
      this._owedReloadChatId = chatId;
      return;
    }
    if (!thread?.messages.length) return;
    const el = this._threadElement();
    const anchor =
      el && !this._isAtBottom(thread) ? this._readingAnchor(el) : null;
    if (anchor) {
      const outcome = await this.loadWindow(chatId, { around: anchor.id });
      if (outcome === 'ok') {
        this._scrollToRow(chatId, anchor.id, anchor.offset);
        return;
      }
      if (outcome !== 'gone') return;
    }
    if ((await this.loadWindow(chatId)) === 'ok') this._scrollToBottom(chatId);
  }

  _payOwedReload(chatId) {
    if (this._owedReloadChatId !== chatId) return;
    if (this.threads.get(chatId)?.loading === 'window') return;
    this._owedReloadChatId = null;
    this._reloadWindow(chatId);
  }

  _setChats(chats) {
    const current = new Map(this.chats.map((c) => [c.chatId, c]));
    this.chats = chats
      .filter((c) => !this._isIgnoredChat(c))
      .map((c) => {
        const next = this._normalizeChat(c);
        const prev = current.get(next.chatId);
        // Keep a newer local preview.
        if (prev && (prev.lastTs ?? 0) > (next.lastTs ?? 0)) {
          return {
            ...next,
            lastBody: prev.lastBody,
            lastTs: prev.lastTs,
            lastFromMe: prev.lastFromMe,
            lastInboundAt:
              Math.max(prev.lastInboundAt ?? 0, next.lastInboundAt ?? 0) ||
              null,
          };
        }
        return next;
      });
  }

  _threadElement() {
    return document.getElementById('wa-messages-container');
  }

  _isNearBottom() {
    const el = this._threadElement();
    return Boolean(
      el &&
      el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_PX,
    );
  }

  _isAtBottom(thread) {
    return !thread?.hasMoreNewer && this._isNearBottom();
  }

  _scrollToBottom(chatId) {
    runTask(this, () => {
      if (this.currentChatId !== chatId) return;
      const el = this._threadElement();
      if (el) el.scrollTop = el.scrollHeight;
      this._payOwedReload(chatId);
    });
  }

  // Row at offset, else bottom.
  _scrollToRow(chatId, messageId, offset) {
    runTask(this, () => {
      if (this.currentChatId !== chatId) return;
      const el = this._threadElement();
      const row = el && this._findRow(el, messageId);
      if (row) {
        const top =
          row.getBoundingClientRect().top - el.getBoundingClientRect().top;
        el.scrollTop += top - offset;
      } else if (el) {
        el.scrollTop = el.scrollHeight;
      }
      this._payOwedReload(chatId);
    });
  }

  _findRow(el, messageId) {
    return [...el.querySelectorAll('[data-message-id]')].find(
      (r) => r.dataset.messageId === messageId,
    );
  }

  // ── Last opened chat ──────────────────────────────────────────────────

  _saveLastChat() {
    const chatId = this.currentChatId;
    const thread = this.currentThread;
    const el = this._threadElement();
    // An unloaded thread would overwrite a good anchor.
    if (!chatId || !el || !thread || thread.loading === 'window') return;
    const anchor = this._readingAnchor(el);
    this.whatsapp.saveLastChat({
      chatId,
      anchorMessageId: anchor?.id ?? null,
      anchorOffset: anchor?.offset ?? 0,
      atBottom: this._isAtBottom(thread),
    });
  }

  _scheduleSave() {
    if (this._saveTimer !== null) return;
    this._saveTimer = runTask(
      this,
      () => {
        this._saveTimer = null;
        this._saveLastChat();
      },
      SAVE_THROTTLE_MS,
    );
  }

  _cancelSave() {
    if (this._saveTimer !== null) {
      cancelTask(this, this._saveTimer);
      this._saveTimer = null;
    }
  }

  applyAi(data) {
    if (data.enabled !== undefined) this.aiEnabled = data.enabled;
    if (data.keyConfigured !== undefined)
      this.aiKeyConfigured = data.keyConfigured;
    if (data.creditsUsed !== undefined) this.creditsUsed = data.creditsUsed;
    if (data.creditsLimit !== undefined) this.creditsLimit = data.creditsLimit;
    if (data.openWindows !== undefined) this.openWindows = data.openWindows;
  }

  // A deleted message loses its body but must still pass the body/hasMedia filter for empty rows.
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

  // Merges mutable fields from a later delivery of the same message id (status/edit/delete).
  _mergeExisting(existing, incoming) {
    let changed = false;
    const merged = { ...existing };
    // A late copy from before an edit must not put the old text back.
    const isOlderBody = (existing.editedAt ?? 0) > (incoming.editedAt ?? 0);
    for (const field of MUTABLE_MESSAGE_FIELDS) {
      if (field === 'body' && isOlderBody) continue;
      const next = incoming[field] ?? null;
      if (next !== null && next !== (existing[field] ?? null)) {
        merged[field] = next;
        changed = true;
      }
    }
    return changed ? merged : null;
  }

  _replaceInThread(chatId, merged) {
    const thread = this.threads.get(chatId);
    this._setThread(chatId, {
      ...thread,
      messages: thread.messages.map((m) => (m.id === merged.id ? merged : m)),
    });
  }

  // A status push carries no body, so it bypasses ingestMessage's renderable filter.
  applyStatus(data) {
    const chatId = this.currentChatId;
    const existing = this.currentChatMessages.find((m) => m.id === data?.id);
    if (!existing) return;
    const merged = this._mergeExisting(existing, {
      status: data.status,
      statusAt: data.statusAt,
      errorCode: data.errorCode,
    });
    if (merged) this._replaceInThread(chatId, merged);
  }

  // Only the open chat's loaded window holds messages.
  ingestMessage(msg) {
    if (!this._isRenderable(msg)) return;
    if (this._isIgnoredChat(msg)) return;
    const normalized = this._normalizeMessage(msg);
    const chatId = normalized.chatId;
    const thread =
      chatId === this.currentChatId ? this.threads.get(chatId) : null;
    const existing = thread?.messages.find((m) => m.id === normalized.id);

    if (existing) {
      const merged = this._mergeExisting(existing, normalized);
      if (merged) this._replaceInThread(chatId, merged);
      return;
    }
    // Updates to unloaded messages.
    if (normalized.editedAt || normalized.deletedAt) return;

    this._updateChat(normalized);
    if (!thread) return;
    if (thread.loading === 'window' || thread.loading === 'newer') {
      this._pendingLive = [...this._pendingLive, normalized];
      return;
    }
    // Only when at the newest.
    if (thread.hasMoreNewer) return;

    const stick = this._isNearBottom();
    this._setThread(chatId, {
      ...thread,
      messages: [...thread.messages, normalized],
      newestId: normalized.id,
    });
    if (stick) this._scrollToBottom(chatId);
  }

  _isIgnoredChat(msg) {
    return Boolean(msg.isGroup);
  }

  _updateChat(msg) {
    const existingIdx = this.chats.findIndex((c) => c.chatId === msg.chatId);
    const isNewer =
      (msg.timestamp ?? 0) >= (this.chats[existingIdx]?.lastTs ?? 0);
    // An inbound message reopens Meta's window; an outbound one never does.
    const inboundAt = msg.fromMe ? null : (msg.timestamp ?? null);

    // Mirrors the chat upsert: a real name is kept, a missing or number-only one takes the message's.
    const current = this.chats[existingIdx];
    const nameMissing =
      !current?.chatName || current.chatName === current.chatId;
    if (existingIdx >= 0 && !isNewer && nameMissing && msg.chatName) {
      const updated = [...this.chats];
      updated[existingIdx] = { ...current, chatName: msg.chatName };
      this.chats = updated;
    } else if (existingIdx >= 0 && isNewer) {
      const updated = [...this.chats];
      updated[existingIdx] = {
        ...current,
        chatName: nameMissing && msg.chatName ? msg.chatName : current.chatName,
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
          chatName: msg.chatName || msg.chatId,
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

  // Meta's exchange code lives only 30 seconds, so the POST fires immediately after the flow finishes.
  @action
  async connectWhatsapp() {
    if (this.isConnecting || !this.signupReady) return;

    this.isConnecting = true;
    try {
      const result = await this.embeddedSignup.launch(this.signupConfig);
      const saved = await this.whatsapp.connect(result);
      this.connection = saved.data ?? saved;
      this.notifications.success('WhatsApp connected');
    } catch (err) {
      // Walking away from a Meta-hosted flow is not an error worth shouting about.
      if (err?.cancelled) {
        this.notifications.info('WhatsApp connection was not completed');
      } else {
        console.error('WhatsApp connect failed', err);
        this.notifications.error(err?.message ?? 'Could not connect WhatsApp');
      }
    } finally {
      this.isConnecting = false;
    }
  }

  @action
  async disconnectWhatsapp() {
    if (this.isConnecting) return;

    this.isConnecting = true;
    try {
      await this.whatsapp.disconnect();
      const connData = await this.whatsapp.getConnection().catch(() => null);
      this.connection = connData?.data ?? null;
      this.notifications.success('WhatsApp disconnected');
    } catch (err) {
      console.error('WhatsApp disconnect failed', err);
      this.notifications.error(err?.message ?? 'Could not disconnect WhatsApp');
    } finally {
      this.isConnecting = false;
    }
  }

  @action
  openDisconnectConfirm() {
    this.isDisconnectConfirmOpen = true;
  }

  @action
  closeDisconnectConfirm() {
    this.isDisconnectConfirmOpen = false;
  }

  @action
  async confirmDisconnect() {
    await this.disconnectWhatsapp();
    this.isDisconnectConfirmOpen = false;
  }

  @action
  selectChat(chatId) {
    if (chatId === this.currentChatId && this.threads.has(chatId)) return;
    this.whatsapp.saveLastChat({
      chatId,
      anchorMessageId: null,
      anchorOffset: 0,
      atBottom: false,
    });
    return this._openChat(chatId);
  }

  async _openChat(chatId, { restore = null } = {}) {
    const previous = this.currentChatId;
    if (previous !== chatId) {
      this._owedReloadChatId = null;
      this._disconnectReadObserver();
      this._cancelSave();
      if (previous) this._setThread(previous, null);
    }
    this._pendingLive = [];
    this.currentChatId = chatId;
    this.whatsapp.activeChatId = chatId;
    const unread = this.whatsapp.unread.get(chatId);
    const markerId =
      unread?.unreadCount > 0 ? (unread.lastReadMessageId ?? null) : null;
    this.unreadMarkerId = markerId;

    // A saved position wins over the unread marker.
    if (restore?.atBottom) {
      if ((await this.loadWindow(chatId)) === 'ok') {
        this._scrollToBottom(chatId);
      }
      return;
    }
    if (restore?.anchorMessageId) {
      const outcome = await this.loadWindow(chatId, {
        around: restore.anchorMessageId,
      });
      if (outcome === 'ok') {
        this._scrollToRow(
          chatId,
          restore.anchorMessageId,
          Number(restore.anchorOffset) || 0,
        );
        return;
      }
      if (outcome !== 'gone') return;
    }

    if (markerId) {
      const outcome = await this.loadWindow(chatId, { around: markerId });
      if (outcome === 'ok') {
        this._scrollToRow(chatId, markerId, MARKER_TOP_OFFSET_PX);
        return;
      }
      if (outcome !== 'gone') return;
      this.unreadMarkerId = null;
    }
    if ((await this.loadWindow(chatId)) === 'ok') this._scrollToBottom(chatId);
  }

  @action
  async onThreadScroll(event) {
    const el = event.target;
    const chatId = this.currentChatId;
    if (!chatId) return;
    this._scheduleSave();
    const state = this.threads.get(chatId);
    if (!state || state.loading) return;
    if (el.scrollTop <= LOAD_OLDER_THRESHOLD_PX) {
      // Only Retry retries.
      if (!state.error) await this._loadOlder(chatId, el);
      return;
    }
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (fromBottom <= LOAD_NEWER_THRESHOLD_PX && !state.newerError) {
      await this.loadEdgePage(chatId, { older: false });
    }
  }

  @action
  retryLoadOlder() {
    const chatId = this.currentChatId;
    const el = this._threadElement();
    if (chatId && el) return this._loadOlder(chatId, el);
  }

  @action
  retryReload() {
    const chatId = this.currentChatId;
    if (chatId) return this._reloadWindow(chatId);
  }

  @action
  retryLoadNewer() {
    const chatId = this.currentChatId;
    if (chatId) return this.loadEdgePage(chatId, { older: false });
  }

  // ── Read tracking ─────────────────────────────────────────────────────

  observeMessageRow = modifier((element, [fromMe]) => {
    if (fromMe || typeof IntersectionObserver === 'undefined') return;
    this._readObserver ??= new IntersectionObserver(
      (entries) => this._onRowsVisible(entries),
      { root: this._threadElement(), threshold: READ_VISIBLE_RATIO },
    );
    const observer = this._readObserver;
    observer.observe(element);
    return () => {
      observer.unobserve(element);
      this._visibleReadRows.delete(element.dataset.messageId);
    };
  });

  _disconnectReadObserver() {
    this._readObserver?.disconnect();
    this._readObserver = null;
    this._visibleReadRows.clear();
  }

  _onRowsVisible(entries) {
    for (const entry of entries) {
      const id = entry.target.dataset.messageId;
      if (entry.isIntersecting) this._visibleReadRows.add(id);
      else this._visibleReadRows.delete(id);
    }
    this._markVisibleRead();
  }

  _isDocumentVisible() {
    return document.visibilityState === 'visible';
  }

  // Rendered rows only.
  _markVisibleRead() {
    const chatId = this.currentChatId;
    if (!chatId || !this._isDocumentVisible()) return;
    const messages = this.currentChatMessages;
    let newest = null;
    for (const m of messages) {
      if (m.fromMe || !this._visibleReadRows.has(m.id)) continue;
      if (!newest || (m.timestamp ?? 0) > (newest.timestamp ?? 0)) newest = m;
    }
    if (!newest) return;
    const lastReadId = this.whatsapp.unread.get(chatId)?.lastReadMessageId;
    if (lastReadId === newest.id) return;
    const lastRead = lastReadId && messages.find((m) => m.id === lastReadId);
    if (lastRead && (newest.timestamp ?? 0) <= (lastRead.timestamp ?? 0)) {
      return;
    }
    this.whatsapp.markRead(chatId, newest.id);
  }

  // First visible row and offset.
  _readingAnchor(el) {
    const top = el.getBoundingClientRect().top;
    for (const row of el.querySelectorAll('[data-message-id]')) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom > top) {
        return { id: row.dataset.messageId, offset: rect.top - top };
      }
    }
    return null;
  }

  async _loadOlder(chatId, el) {
    const anchor = this._readingAnchor(el);
    const prevHeight = el.scrollHeight;
    const loaded = await this.loadEdgePage(chatId, { older: true });
    if (!loaded || this.currentChatId !== chatId) return;
    // Keep the reading position.
    runTask(this, () => {
      if (this.currentChatId !== chatId) return;
      const row = anchor && this._findRow(el, anchor.id);
      if (row) {
        const offset =
          row.getBoundingClientRect().top - el.getBoundingClientRect().top;
        el.scrollTop += offset - anchor.offset;
      } else {
        el.scrollTop += el.scrollHeight - prevHeight;
      }
    });
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
      const chatId = this.currentChatId;
      const result = await this.whatsapp.sendMessage(chatId, body);
      this.messageText = '';
      if (chatId !== this.currentChatId) return;
      if (this.threads.get(chatId)?.hasMoreNewer) {
        // Jump to latest.
        this._updateChat(this._normalizeMessage(result.data ?? result));
        if ((await this.loadWindow(chatId)) === 'ok') {
          this._scrollToBottom(chatId);
        }
        return;
      }
      // Dedupes a later socket echo.
      this.ingestMessage(result.data ?? result);
      this._scrollToBottom(chatId);
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
    } catch (err) {
      this.notifications.error(err.message || 'Could not toggle AI');
    }
  }
}
