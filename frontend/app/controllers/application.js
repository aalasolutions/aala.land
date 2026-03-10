import Controller from '@ember/controller';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class ApplicationController extends Controller {
  @service session;
  @service auth;
  @service router;

  @tracked unreadCount = 0;
  @tracked showNotifications = false;
  @tracked notifications = [];

  async loadUnreadCount() {
    if (!this.session.isAuthenticated) return;
    try {
      const result = await this.auth.fetchJson('/notifications/unread-count');
      this.unreadCount = result.data?.count ?? 0;
    } catch {
      // silently fail
    }
  }

  @action
  async toggleNotifications() {
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) {
      try {
        const result = await this.auth.fetchJson('/notifications?page=1&limit=10');
        this.notifications = result.data?.data ?? [];
      } catch {
        this.notifications = [];
      }
    }
  }

  @action
  closeNotifications() {
    this.showNotifications = false;
  }

  @action
  async markAsRead(notification) {
    try {
      await this.auth.fetchJson(`/notifications/${notification.id}/read`, { method: 'PATCH' });
      notification.isRead = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.notifications = [...this.notifications];
    } catch {
      // silently fail
    }
  }

  @action
  async markAllRead() {
    try {
      await this.auth.fetchJson('/notifications/read-all', { method: 'PATCH' });
      this.unreadCount = 0;
      this.notifications = this.notifications.map(n => ({ ...n, isRead: true }));
    } catch {
      // silently fail
    }
  }

  @action
  async logout() {
    await this.auth.logout();
    this.router.transitionTo('login');
  }
}
