import Service, { service } from '@ember/service';
import { io } from 'socket.io-client';
import ENV from 'land/config/environment';

export default class WhatsappService extends Service {
  @service auth;

  _socket = null;

  get apiUrl() {
    const base =
      ENV.APP.API_URL || ENV.APP.API_BASE || 'http://localhost:3010/v1';
    return new URL(base, window.location.origin).origin;
  }

  connectSocket(onEvent) {
    if (this._socket) return this._socket;

    this._socket = io(`${this.apiUrl}/whatsapp`, {
      // Function form: socket.io calls this on every (re)connect, so a
      // refreshed token is picked up instead of the one captured at first
      // connect.
      auth: (cb) => cb({ token: this.auth.token }),
    });

    this._socket.on('connect_error', (err) =>
      console.error('WhatsApp socket connect failed:', err.message),
    );

    this._socket.on('whatsapp:status', (data) => onEvent('status', data));
    this._socket.on('whatsapp:message', (data) => onEvent('message', data));
    this._socket.on('whatsapp:ai', (data) => onEvent('ai', data));

    return this._socket;
  }

  disconnectSocket() {
    if (this._socket) {
      this._socket.disconnect();
      this._socket = null;
    }
  }

  getConnection() {
    return this.auth.fetchJson('/whatsapp/connection');
  }
  getChats() {
    return this.auth.fetchJson('/whatsapp/chats');
  }
  // No page/limit sent: deliberate phase-cut caps, 500 rows here and 200 per
  // chat below, no "load older" path yet.
  getAllMessages() {
    return this.auth.fetchJson('/whatsapp/messages');
  }
  getMessages(chatId) {
    return this.auth.fetchJson(
      `/whatsapp/messages/${encodeURIComponent(chatId)}`,
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
    this.disconnectSocket();
  }
}
