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
    const userId = this.auth.currentUser.id;

    this.socket = io(apiUrl, {
      query: { userId }
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('[SOCKET] Connected to notifications namespace');
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      console.log('[SOCKET] Disconnected');
    });

    this.socket.on('newNotification', (notification) => {
      console.log('[SOCKET] New notification received:', notification);
      if (this.onNotificationReceived) {
        this.onNotificationReceived(notification);
      }
      
      this.notifications.info(notification.message);
    });
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
