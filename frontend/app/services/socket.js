import Service from '@ember/service';
import { service } from '@ember/service';
import { io } from 'socket.io-client';
import { tracked } from '@glimmer/tracking';
import ENV from 'frontend/config/environment';

export default class SocketService extends Service {
  @service auth;
  @service notifications;

  socket = null;
  @tracked isConnected = false;

  setup() {
    if (this.socket || !this.auth.currentUser) return;

    const apiUrl = ENV.APP.API_URL || 'http://localhost:3010';
    const token = this.auth.token;
    if (!token) return;

    this.socket = io(apiUrl, {
      auth: { token }
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
    });

    this.socket.on('newNotification', (notification) => {
      this.notifications.info(notification.message);
    });
  }

  on(eventName, handler) {
    this.setup();
    if (!this.socket || typeof handler !== 'function') return;
    this.socket.on(eventName, handler);
  }

  off(eventName, handler) {
    if (!this.socket || typeof handler !== 'function') return;
    this.socket.off(eventName, handler);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.disconnect();
  }
}
