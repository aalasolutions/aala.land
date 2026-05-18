// frontend/app/services/whatsapp.js
import Service from '@ember/service';
import { service } from '@ember/service';
import { io } from 'socket.io-client';
import ENV from 'frontend/config/environment';

export default class WhatsappService extends Service {
  @service auth;

  _socket = null;

  get apiUrl() {
    const base = ENV.APP.API_BASE || 'http://localhost:3010/v1';
    return ENV.APP.API_URL || new URL(base).origin;
  }

  // ── Socket ────────────────────────────────────────────────────────────

  connectSocket(onEvent) {
    if (this._socket) return this._socket;

    this._socket = io(`${this.apiUrl}/whatsapp`, {
      auth: { token: this.auth.token },
    });

    // Join the user-specific room so events are scoped
    this._socket.on('connect', () => {
      const userId = this.auth.currentUser?.userId;
      if (userId) {
        this._socket.emit('join', { userId });
      }
    });

    this._socket.on('whatsapp:status',  data => onEvent('status', data));
    this._socket.on('whatsapp:qr',      data => onEvent('qr', data));
    this._socket.on('whatsapp:message', data => onEvent('message', data));
    this._socket.on('whatsapp:ai',      data => onEvent('ai', data));

    return this._socket;
  }

  disconnectSocket() {
    if (this._socket) {
      this._socket.disconnect();
      this._socket = null;
    }
  }

  // ── REST helpers ──────────────────────────────────────────────────────

  getConnection()          { return this.auth.fetchJson('/whatsapp/connection'); }
  getQR()                  { return this.auth.fetchJson('/whatsapp/qr'); }
  getChats()               { return this.auth.fetchJson('/whatsapp/chats'); }
  getAllMessages()          { return this.auth.fetchJson('/whatsapp/messages'); }
  getMessages(chatId)      { return this.auth.fetchJson(`/whatsapp/messages/${encodeURIComponent(chatId)}`); }
  getAi()                  { return this.auth.fetchJson('/whatsapp/ai'); }
  getSettings()            { return this.auth.fetchJson('/whatsapp/settings'); }

  logout() {
    return this.auth.fetchJson('/whatsapp/logout', { method: 'POST' });
  }

  sendMessage(chatId, message, replyTo) {
    return this.auth.fetchJson('/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ chatId, message, replyTo }),
    });
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

  mediaUrl(type, filename) {
    const typeMap = { image: 'images', sticker: 'images', video: 'videos', audio: 'audio', ptt: 'audio', document: 'documents' };
    const subdir = typeMap[type] ?? 'documents';
    return `${this.apiUrl}/v1/whatsapp/media/${subdir}/${encodeURIComponent(filename.split(/[/\\]/).pop())}`;
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.disconnectSocket();
  }
}
