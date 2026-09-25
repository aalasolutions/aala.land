import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { io } from 'socket.io-client';
import { isDestroying } from '@ember/destroyable';
import { runTask, cancelTask } from 'ember-lifeline';
import ENV from 'land/config/environment';

const REOPEN_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];
const READ_THROTTLE_MS = 1000;
const LAST_CHAT_KEY_PREFIX = 'wa:lastChat:';
const MEDIA_URL_MIN_REMAINING_MS = 60_000;

export function isIgnoredChat(item) {
  return Boolean(item.isGroup);
}

// Signed media URLs are only ever http(s); anything else is refused, never cached.
function httpUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

export default class WhatsappService extends Service {
  @service auth;
  @service notifications;

  // Replaced on write.
  @tracked unread = new Map();
  // Replaced on write.
  @tracked chats = [];
  // Message shown in the page-level media viewer.
  @tracked viewerMessage = null;
  // Chat open on the WhatsApp page.
  activeChatId = null;
  _toastIds = new Map();
  _pendingRead = new Map();
  _readTimers = new Map();
  // Last marker emitted per chat.
  _sentRead = new Map();
  _unackedRead = new Map();
  _unreadWrites = 0;
  _seedSeq = 0;
  _appliedSeedSeq = 0;
  // chatId to write number.
  _liveUnreadWrites = new Map();
  _lastChatLocked = false;
  // uuid to { url, expiresAt } in epoch ms.
  _mediaUrls = new Map();
  _mediaUrlRequests = new Map();
  // Bumped on user change so an in-flight URL never lands in the next user's cache.
  _mediaUrlGeneration = 0;

  _socket = null;
  _resyncGeneration = 0;
  _resyncInFlight = false;
  _resyncPending = false;
  _wanted = false;
  _reopenTimer = null;
  _reopenAttempts = 0;
  _listeners = {
    message: new Set(),
    'message-update': new Set(),
    status: new Set(),
    ai: new Set(),
    chats: new Set(),
    history: new Set(),
    connection: new Set(),
  };

  get apiUrl() {
    const base =
      ENV.APP.API_URL || ENV.APP.API_BASE || 'http://localhost:3010/v1';
    return new URL(base, window.location.origin).origin;
  }

  connectSocket() {
    this._wanted = true;
    this._lastChatLocked = false;
    if (this._socket?.active) return this._socket;
    // Replace a server-closed socket.
    this._closeSocket();
    this._cancelReopen();

    const socket = this._openSocket();
    this._socket = socket;

    socket.on('connect', () => this._requeueUnackedRead());
    socket.on('connect_error', (err) => {
      console.error('WhatsApp socket connect failed:', err.message);
      // Inactive means middleware rejection.
      if (!socket.active) this._scheduleReopen(socket);
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') this._scheduleReopen(socket);
    });

    socket.on('whatsapp:status', (data) => this._emit('status', data));
    socket.on('whatsapp:message', (data) => {
      this._toastInbound(data);
      this._emit('message', data);
    });
    socket.on('whatsapp:message-update', (data) =>
      this._emit('message-update', data),
    );
    socket.on('whatsapp:ai', (data) => this._emit('ai', data));
    socket.on('whatsapp:unread', (data) => this._applyUnread(data));
    socket.on('whatsapp:ready', (payload) => this._onReady(payload));
    socket.on('whatsapp:history', (data) => this._onHistory(data));
    socket.on('whatsapp:connection', (data) => this._emit('connection', data));

    return socket;
  }

  get totalUnread() {
    let total = 0;
    for (const state of this.unread.values()) total += state.unreadCount;
    return total;
  }

  // Take before the chats request.
  beginUnreadSeed() {
    return { seq: ++this._seedSeq, since: this._unreadWrites };
  }

  // Replaces the map.
  seedUnread(chats, ticket = this.beginUnreadSeed()) {
    if (ticket.seq < this._appliedSeedSeq) return;
    const since = ticket.since;
    const next = new Map();
    for (const chat of chats ?? []) {
      next.set(chat.chatId, {
        unreadCount: chat.unreadCount ?? 0,
        lastReadMessageId: chat.lastReadMessageId ?? null,
        chatName: chat.chatName ?? null,
      });
    }
    for (const [chatId, write] of this._liveUnreadWrites) {
      if (write > since && this.unread.has(chatId)) {
        next.set(chatId, this.unread.get(chatId));
      } else {
        this._liveUnreadWrites.delete(chatId);
      }
    }
    this._appliedSeedSeq = ticket.seq;
    this.unread = next;
  }

  // One response feeds the list and the unread map, so a stale ticket skips both.
  seedChats(chats, ticket) {
    if (ticket.seq < this._appliedSeedSeq) return;
    this.seedUnread(chats, ticket);
    this._setChats(chats);
  }

  _setChats(chats) {
    const current = new Map(this.chats.map((c) => [c.chatId, c]));
    this.chats = chats
      .filter((c) => !isIgnoredChat(c))
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
            lastMessageId: prev.lastMessageId,
            lastInboundAt:
              Math.max(prev.lastInboundAt ?? 0, next.lastInboundAt ?? 0) ||
              null,
          };
        }
        return next;
      });
  }

  _normalizeChat(chat) {
    return {
      ...chat,
      lastTs: chat.lastTs ? chat.lastTs * 1000 : chat.lastTs,
      lastInboundAt: chat.lastInboundAt ? chat.lastInboundAt * 1000 : null,
    };
  }

  updateChat(msg) {
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
        lastMessageId: msg.id ?? null,
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
          lastMessageId: msg.id ?? null,
          lastInboundAt: inboundAt,
        },
        ...this.chats,
      ];
    }
  }

  // A seeded chat carries no message id, so its preview timestamp identifies the last message.
  isChatLastMessage(msg) {
    const chat = this.chats.find((c) => c.chatId === msg?.chatId);
    if (!chat) return false;
    return chat.lastMessageId
      ? chat.lastMessageId === msg.id
      : Boolean(chat.lastTs) && chat.lastTs === msg.timestamp;
  }

  _markSeeded() {
    this._appliedSeedSeq = ++this._seedSeq;
    this._liveUnreadWrites.clear();
  }

  _applyUnread(data) {
    if (!data?.chatId) return;
    const next = new Map(this.unread);
    next.set(data.chatId, {
      chatName: next.get(data.chatId)?.chatName ?? null,
      unreadCount: data.unreadCount ?? 0,
      lastReadMessageId: data.lastReadMessageId ?? null,
    });
    this._liveUnreadWrites.set(data.chatId, ++this._unreadWrites);
    this.unread = next;
  }

  // Edits and deletes do not toast.
  _toastInbound(msg) {
    if (!msg?.chatId || msg.fromMe || msg.editedAt || msg.deletedAt) return;
    if (msg.chatId === this.activeChatId) return;
    const name =
      msg.chatName || this.unread.get(msg.chatId)?.chatName || msg.chatId;
    const previous = this._toastIds.get(msg.chatId);
    if (previous !== undefined) this.notifications.remove(previous);
    this._toastIds.set(
      msg.chatId,
      this.notifications.success(`New WhatsApp message from ${name}`, 0),
    );
  }

  // Newest marker, one emit per second.
  markRead(chatId, messageId) {
    if (!chatId || !messageId) return;
    if (this._sentRead.get(chatId) === messageId) return;
    this._pendingRead.set(chatId, messageId);
    if (!this._readTimers.has(chatId)) this._flushRead(chatId);
  }

  _flushRead(chatId) {
    const messageId = this._pendingRead.get(chatId);
    const socket = this._socket;
    // Left pending for the next ready.
    if (!messageId || !socket?.connected) return;
    this._pendingRead.delete(chatId);
    if (this._sentRead.get(chatId) === messageId) return;
    this._sentRead.set(chatId, messageId);
    this._unackedRead.set(chatId, messageId);
    socket.emit('whatsapp:read', { chatId, messageId }, (ack) => {
      if (this._unackedRead.get(chatId) === messageId) {
        this._unackedRead.delete(chatId);
      }
      if (!ack?.chatId || ack.error) {
        console.error('WhatsApp mark read failed', ack);
        // Allows a retry of the same marker.
        if (this._sentRead.get(chatId) === messageId) {
          this._sentRead.delete(chatId);
        }
        return;
      }
      this._applyUnread(ack);
    });
    this._readTimers.set(
      chatId,
      this._later(() => {
        this._readTimers.delete(chatId);
        this._flushRead(chatId);
      }, READ_THROTTLE_MS),
    );
  }

  // Resent after reconnect.
  _requeueUnackedRead() {
    for (const [chatId, messageId] of this._unackedRead) {
      if (this._sentRead.get(chatId) === messageId) {
        this._sentRead.delete(chatId);
      }
      if (!this._pendingRead.has(chatId)) {
        this._pendingRead.set(chatId, messageId);
      }
    }
    this._unackedRead.clear();
  }

  _cancelReadTimers() {
    if (!isDestroying(this)) {
      for (const timer of this._readTimers.values()) cancelTask(this, timer);
    }
    this._readTimers.clear();
  }

  _openSocket() {
    return io(`${this.apiUrl}/whatsapp`, {
      // Function form: called on each reconnect, so a fresh token replaces the first-connect one.
      auth: (cb) => cb({ token: this.auth.token }),
    });
  }

  _later(fn, ms) {
    return runTask(this, fn, ms);
  }

  _scheduleReopen(socket) {
    if (!this._wanted || socket !== this._socket || this._reopenTimer !== null)
      return;
    const delay =
      REOPEN_DELAYS_MS[
        Math.min(this._reopenAttempts, REOPEN_DELAYS_MS.length - 1)
      ];
    this._reopenAttempts++;
    this._reopenTimer = this._later(() => {
      this._reopenTimer = null;
      if (this._wanted) this.connectSocket();
    }, delay);
  }

  _cancelReopen() {
    if (this._reopenTimer !== null) {
      // Lifeline cleans up on destroy.
      if (!isDestroying(this)) cancelTask(this, this._reopenTimer);
      this._reopenTimer = null;
    }
  }

  _closeSocket() {
    if (this._socket) {
      this._socket.disconnect();
      this._socket = null;
    }
    // Drops any in-flight resync.
    this._resyncGeneration++;
    this._resyncInFlight = false;
    this._resyncPending = false;
  }

  // Logout and access loss only.
  disconnectSocket() {
    this._stopSocket();
    this._clearUserState();
    this._lastChatLocked = true;
  }

  _stopSocket() {
    this._wanted = false;
    this._cancelReopen();
    this._cancelReadTimers();
    this._pendingRead.clear();
    this._sentRead.clear();
    this._unackedRead.clear();
    this._reopenAttempts = 0;
    this._closeSocket();
  }

  _clearUserState() {
    this._markSeeded();
    if (this.unread.size) this.unread = new Map();
    if (this.chats.length) this.chats = [];
    if (this._toastIds.size) {
      for (const id of this._toastIds.values()) this.notifications.remove(id);
      this._toastIds.clear();
    }
    this._mediaUrlGeneration++;
    this._mediaUrls.clear();
    this._mediaUrlRequests.clear();
    this.viewerMessage = null;
    this.activeChatId = null;
    this.clearLastChat();
  }

  _lastChatKey() {
    const userId = this.auth.currentUser?.id;
    return userId ? `${LAST_CHAT_KEY_PREFIX}${userId}` : null;
  }

  // { chatId, anchorMessageId, anchorOffset, atBottom }
  saveLastChat(entry) {
    const key = this._lastChatKey();
    if (!key || this._lastChatLocked) return;
    try {
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // Storage blocked or full.
    }
  }

  readLastChat() {
    const key = this._lastChatKey();
    if (!key) return null;
    try {
      const entry = JSON.parse(localStorage.getItem(key));
      return typeof entry?.chatId === 'string' ? entry : null;
    } catch {
      return null;
    }
  }

  clearLastChat() {
    const key = this._lastChatKey();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage blocked.
    }
  }

  on(type, fn) {
    this._listeners[type]?.add(fn);
  }

  off(type, fn) {
    this._listeners[type]?.delete(fn);
  }

  _emit(type, data) {
    for (const fn of [...this._listeners[type]]) fn(data);
  }

  // Unrecovered ready may have missed events.
  _onReady(payload) {
    this._reopenAttempts = 0;
    for (const chatId of [...this._pendingRead.keys()]) {
      if (!this._readTimers.has(chatId)) this._flushRead(chatId);
    }
    if (payload?.recovered) return;
    this._resync();
  }

  // Synced history lands without live pushes, so the chat list is refetched once it completes.
  _onHistory(data) {
    this._emit('history', data);
    if (data?.status === 'complete') this._resync();
  }

  async _resync() {
    if (this._resyncInFlight) {
      this._resyncPending = true;
      return;
    }
    const generation = this._resyncGeneration;
    const seedTicket = this.beginUnreadSeed();
    this._resyncInFlight = true;
    try {
      const chats = await this.getChats();
      if (generation !== this._resyncGeneration) return;
      const list = chats?.data?.chats ?? chats?.chats ?? [];
      this.seedChats(list, seedTicket);
      this._emit('chats', list);
    } catch (err) {
      console.error('WhatsApp resync failed', err);
    } finally {
      if (generation === this._resyncGeneration) {
        this._resyncInFlight = false;
        if (this._resyncPending) {
          this._resyncPending = false;
          this._resync();
        }
      }
    }
  }

  getConnection() {
    return this.auth.fetchJson('/whatsapp/connection');
  }
  getSignupConfig() {
    return this.auth.fetchJson('/whatsapp/signup-config');
  }
  connect({ code, wabaId, phoneNumberId, isCoexistence }) {
    return this.auth.fetchJson('/whatsapp/connect', {
      method: 'POST',
      body: JSON.stringify({ code, wabaId, phoneNumberId, isCoexistence }),
    });
  }
  disconnect() {
    return this.auth.fetchJson('/whatsapp/connection', { method: 'DELETE' });
  }
  getChats() {
    return this.auth.fetchJson('/whatsapp/chats');
  }
  getMessages(chatId, { before, after, around, limit = 50 } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    if (after) params.set('after', after);
    if (around) params.set('around', around);
    return this.auth.fetchJson(
      `/whatsapp/messages/${encodeURIComponent(chatId)}?${params}`,
    );
  }
  getAi() {
    return this.auth.fetchJson('/whatsapp/ai');
  }
  getSettings() {
    return this.auth.fetchJson('/whatsapp/settings');
  }

  sendMessage(chatId, body) {
    return this.auth.fetchJson('/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ chatId, body }),
    });
  }

  // A cached URL with more than a minute left, else null; an expired entry is pruned.
  peekMediaUrl(uuid) {
    const cached = this._mediaUrls.get(uuid);
    if (!cached) return null;
    const remaining = cached.expiresAt - Date.now();
    if (remaining <= 0) this._mediaUrls.delete(uuid);
    return remaining > MEDIA_URL_MIN_REMAINING_MS ? cached.url : null;
  }

  // Signed URLs expire, so a cached one is reused only while more than a minute is left.
  getMediaUrl(uuid, { fresh = false } = {}) {
    const cached = fresh ? null : this.peekMediaUrl(uuid);
    if (cached) return Promise.resolve(cached);
    const inFlight = this._mediaUrlRequests.get(uuid);
    if (inFlight && !fresh) return inFlight;

    const generation = this._mediaUrlGeneration;
    const request = this.auth
      .fetchJson(`/whatsapp/messages/${encodeURIComponent(uuid)}/media`)
      .then((result) => {
        const data = result?.data ?? result;
        const url = httpUrl(data?.url);
        if (!url) throw new Error('Invalid media URL');
        if (generation === this._mediaUrlGeneration) {
          this._mediaUrls.set(uuid, {
            url,
            expiresAt: Date.parse(data.expiresAt) || 0,
          });
        }
        return url;
      })
      .finally(() => {
        if (this._mediaUrlRequests.get(uuid) === request) {
          this._mediaUrlRequests.delete(uuid);
        }
      });
    this._mediaUrlRequests.set(uuid, request);
    return request;
  }

  openMediaViewer(msg) {
    this.viewerMessage = msg ?? null;
  }

  closeMediaViewer() {
    this.viewerMessage = null;
  }

  async deleteMedia(uuid, reason) {
    await this.auth.fetchJson(
      `/whatsapp/messages/${encodeURIComponent(uuid)}/delete-media`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    );
    this._mediaUrls.delete(uuid);
  }

  toggleAi(enabled) {
    return this.auth.fetchJson('/whatsapp/ai/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  updateSettings(aiPrompt) {
    return this.auth.fetchJson('/whatsapp/settings', {
      method: 'PATCH',
      body: JSON.stringify({ aiPrompt: aiPrompt || null }),
    });
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this._stopSocket();
  }
}
