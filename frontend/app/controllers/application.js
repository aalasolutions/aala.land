import Controller from '@ember/controller';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class ApplicationController extends Controller {
  @service session;
  @service auth;
  @service router;
  @service region;

  get isAdmin() {
    const role = this.auth.currentUser?.role;
    return role === 'company_admin' || role === 'super_admin';
  }

  @tracked unreadCount = 0;
  @tracked showNotifications = false;
  @tracked notifications = [];
  @tracked expandedGroup = null;
  @tracked sidebarCollapsed = false;
  @tracked showRegionDropdown = false;

  @tracked searchQuery = '';
  @tracked searchResults = null;
  @tracked showSearchDropdown = false;
  @tracked isSearching = false;
  @tracked searchError = false;
  @tracked activeSearchIndex = -1;
  _searchTimer = null;

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

  get searchResultsList() {
    if (!this.searchResults) {
      return [];
    }

    return [
      ...(this.searchResults.properties || []),
      ...(this.searchResults.agents || []),
    ];
  }

  get activeSearchResultId() {
    return this.activeSearchIndex >= 0 ? `search-result-item-${this.activeSearchIndex}` : undefined;
  }

  scrollActiveSearchResultIntoView() {
    if (!this.activeSearchResultId) {
      return;
    }

    setTimeout(() => {
      const activeElement = document.getElementById(this.activeSearchResultId);
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
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
  onSearchInput(e) {
    this.searchQuery = e.target.value;
    this.activeSearchIndex = -1;
    clearTimeout(this._searchTimer);

    if (this.searchQuery.length < 2) {
      this.showSearchDropdown = false;
      this.searchResults = null;
      this.searchError = false;
      this.isSearching = false;
      return;
    }

    this._searchTimer = setTimeout(async () => {
      const queryAtTimeOfRequest = this.searchQuery;
      this.isSearching = true;
      this.showSearchDropdown = true;
      this.searchError = false;
      try {
        const result = await this.auth.fetchJson(`/search?q=${encodeURIComponent(queryAtTimeOfRequest)}`);
        if (queryAtTimeOfRequest === this.searchQuery) {
          this.searchResults = result?.data ?? result; // Support both { data: ... } and direct response formats
          this.activeSearchIndex = -1;
        }
      } catch {
        if (queryAtTimeOfRequest === this.searchQuery) {
          this.searchError = true;
          this.searchResults = null;
          this.activeSearchIndex = -1;
        }
      } finally {
        if (queryAtTimeOfRequest === this.searchQuery) {
          this.isSearching = false;
        }
      }
    }, 300);
  }

  @action
  onSearchKeydown(e) {
    if (e.key === 'Escape') {
      this.closeSearch();
      return;
    }

    const results = this.searchResultsList;
    if (!this.showSearchDropdown || !results.length) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.activeSearchIndex = Math.min(this.activeSearchIndex + 1, results.length - 1);
        this.scrollActiveSearchResultIntoView();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.activeSearchIndex = Math.max(this.activeSearchIndex - 1, 0);
        this.scrollActiveSearchResultIntoView();
        break;
      case 'Enter':
        if (this.activeSearchIndex >= 0) {
          e.preventDefault();
          this.onSearchSelect(results[this.activeSearchIndex]);
        }
        break;
    }
  }

  @action
  closeSearch() {
    this.showSearchDropdown = false;
    this.searchQuery = '';
    this.searchResults = null;
    this.searchError = false;
    this.isSearching = false;
    this.activeSearchIndex = -1;
    clearTimeout(this._searchTimer);
  }

  @action
  onSearchSelect(result) {
    this.activeSearchIndex = -1;
    this.closeSearch();
    if (result.type === 'city') {
      this.router.transitionTo('properties');
    } else if (result.type === 'locality') {
      this.router.transitionTo('properties.detail', result.id);
    } else if (result.type === 'asset') {
      this.router.transitionTo('properties.detail', result.id);
    } else if (result.type === 'agent') {
      this.router.transitionTo('team');
    }
  }

  @action
  async logout() {
    await this.auth.logout();
    this.router.transitionTo('login');
  }
}
