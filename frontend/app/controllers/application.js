import Controller from '@ember/controller';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class ApplicationController extends Controller {
  @service session;
  @service auth;
  @service router;
  @service region;

  @tracked unreadCount = 0;
  @tracked showNotifications = false;
  @tracked notifications = [];
  @tracked expandedGroup = null;
  @tracked sidebarCollapsed = false;
  @tracked showRegionDropdown = false;

  get showRegionSwitcher() {
    return this.region.regions.length > 1;
  }

  routeGroupMap = {
    properties: 'properties', 'properties.index': 'properties', 'properties.detail': 'properties',
    owners: 'properties', 'owners.index': 'properties', 'owners.detail': 'properties',
    leads: 'crm', contacts: 'crm',
    leases: 'finance', financials: 'finance', cheques: 'finance', commissions: 'finance',
    'email-templates': 'outreach',
    maintenance: 'operations', vendors: 'operations',
    team: 'admin', audit: 'admin',
  };

  get activeGroup() {
    const route = this.router.currentRouteName;
    if (!route) return null;
    const base = route.split('.')[0];
    return this.routeGroupMap[route] ?? this.routeGroupMap[base] ?? null;
  }

  constructor() {
    super(...arguments);
    this.router.on('routeDidChange', () => {
      const group = this.activeGroup;
      if (group) this.expandedGroup = group;
    });
  }

  @action
  toggleGroup(group) {
    this.expandedGroup = this.expandedGroup === group ? null : group;
  }

  @action
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    if (this.sidebarCollapsed) {
      this.expandedGroup = null;
    }
  }

  async loadUnreadCount() {
    if (!this.session.isAuthenticated) return;
    try {
      const result = await this.auth.fetchJson('/notifications/unread-count');
      this.unreadCount = result.data?.count ?? 0;
    } catch (e) {
      console.error('[APP-CTRL] Failed to load unread count:', e.message);
    }
  }

  @action
  async toggleNotifications() {
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) {
      try {
        const result = await this.auth.fetchJson('/notifications?page=1&limit=10');
        this.notifications = result.data?.data ?? [];
      } catch (e) {
        console.error('[APP-CTRL] Failed to load notifications:', e.message);
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
    } catch (e) {
      console.error('[APP-CTRL] Failed to mark notification as read:', e.message);
    }
  }

  @action
  async markAllRead() {
    try {
      await this.auth.fetchJson('/notifications/read-all', { method: 'PATCH' });
      this.unreadCount = 0;
      this.notifications = this.notifications.map(n => ({ ...n, isRead: true }));
    } catch (e) {
      console.error('[APP-CTRL] Failed to mark all notifications as read:', e.message);
    }
  }

  @action
  toggleRegionDropdown() {
    this.showRegionDropdown = !this.showRegionDropdown;
  }

  @action
  closeRegionDropdown() {
    this.showRegionDropdown = false;
  }

  @action
  selectRegion(selectedRegion) {
    this.region.switchRegion(selectedRegion);
    this.showRegionDropdown = false;

    const currentRoute = this.router.currentRouteName;
    const params = this.router.currentRoute?.params || {};
    const hasDynamicSegment = Object.keys(params).length > 0;

    if (hasDynamicSegment) {
      const parentRoute = currentRoute.split('.').slice(0, -1).join('.') || 'dashboard';
      this.router.transitionTo(parentRoute);
    } else {
      this.router.refresh();
    }
  }

  @action
  async logout() {
    await this.auth.logout();
    this.router.transitionTo('login');
  }
}
