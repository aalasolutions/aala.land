import Controller from '@ember/controller';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { cancelDebounce, debounceTask, runTask } from 'ember-lifeline';
import { isAdminRole, getVisibleGroups, canSwitchRegion } from '../utils/roles';

export default class ApplicationController extends Controller {
  @service session;
  @service auth;
  @service router;
  @service region;
  @service socket;

  get isCompanyAdmin() {
    return this.auth.currentUser?.role === 'company_admin';
  }

  get isSuperAdmin() {
    return this.auth.currentUser?.role === 'super_admin';
  }

  get isAdmin() {
    return isAdminRole(this.auth.currentUser?.role);
  }

  get sidebarGroups() {
    return getVisibleGroups(this.auth.currentUser?.role);
  }

  // Desktop collapse (icon rail) only applies above the responsive breakpoint.
  // Below it the sidebar is always a rail that expands as an overlay instead.
  get desktopCollapsed() {
    return this.sidebarCollapsed && !this.isNarrow;
  }

  // True when the sidebar is visually a rail (drives the toggle button caret).
  get sidebarRailed() {
    return this.isNarrow ? !this.sidebarMobileOpen : this.sidebarCollapsed;
  }

  @tracked unreadCount = 0;
  @tracked showNotifications = false;
  @tracked notifications = [];
  @tracked expandedGroup = null;
  @tracked sidebarCollapsed = false;
  @tracked sidebarMobileOpen = false;
  @tracked isNarrow = false;
  @tracked showRegionDropdown = false;
  notificationHandler = null;
  socketConnectHandler = null;
  routeDidChangeHandler = null;
  sidebarMedia = null;
  sidebarMediaHandler = null;

  @tracked searchQuery = '';
  @tracked searchResults = null;
  @tracked showSearchDropdown = false;
  @tracked isSearching = false;
  @tracked searchError = false;
  @tracked activeSearchIndex = -1;

  get showRegionSwitcher() {
    return (
      canSwitchRegion(this.auth.currentUser?.role) &&
      this.region.regions.length > 1
    );
  }

  get showRegionLabel() {
    return (
      !canSwitchRegion(this.auth.currentUser?.role) &&
      this.region.regions.length > 0
    );
  }

  // Regions grouped by country for the switcher, sorted by country then region.
  get groupedRegions() {
    const groups = new Map();
    for (const r of this.region.regions) {
      const countryName = r.countryName || r.country || 'Other';
      if (!groups.has(countryName)) groups.set(countryName, []);
      groups.get(countryName).push(r);
    }
    return [...groups.entries()]
      .map(([countryName, regions]) => ({
        countryName,
        regions: regions.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.countryName.localeCompare(b.countryName));
  }

  routeGroupMap = {
    properties: 'properties',
    'properties.index': 'properties',
    'properties.detail': 'properties',
    leases: 'properties',
    owners: 'properties',
    'owners.index': 'properties',
    'owners.detail': 'properties',
    documents: 'documents',
    leads: 'crm',
    contacts: 'crm',
    financials: 'finance',
    cheques: 'finance',
    commissions: 'finance',
    maintenance: 'operations',
    vendors: 'operations',
    team: 'admin',
    audit: 'admin',
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
    return this.activeSearchIndex >= 0
      ? `search-result-item-${this.activeSearchIndex}`
      : undefined;
  }

  scrollActiveSearchResultIntoView() {
    if (!this.activeSearchResultId) {
      return;
    }

    runTask(
      this,
      () => {
        const activeElement = document.getElementById(this.activeSearchResultId);
        if (activeElement) {
          activeElement.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth',
          });
        }
      },
      0,
    );
  }

  constructor() {
    super(...arguments);
    this.routeDidChangeHandler = () => {
      const group = this.activeGroup;
      if (group) this.expandedGroup = group;
      // Close the mobile overlay after navigating.
      this.sidebarMobileOpen = false;

      if (this.session.isAuthenticated) {
        this.setupSocket();
      } else {
        this.teardownSocket();
      }
    };

    this.router.on('routeDidChange', this.routeDidChangeHandler);

    // Track the responsive breakpoint. Must mirror the sidebar rail media query
    // in app.scss (max-width: 1024px).
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.sidebarMedia = window.matchMedia('(max-width: 1024px)');
      this.isNarrow = this.sidebarMedia.matches;
      this.sidebarMediaHandler = (e) => {
        this.isNarrow = e.matches;
        // Leaving mobile: drop the overlay so desktop state stays clean.
        if (!e.matches) this.sidebarMobileOpen = false;
      };
      this.sidebarMedia.addEventListener('change', this.sidebarMediaHandler);
    }

    if (this.session.isAuthenticated) {
      this.setupSocket();
    } else {
      this.teardownSocket();
    }
  }

  @action
  toggleGroup(group) {
    this.expandedGroup = this.expandedGroup === group ? null : group;
  }

  @action
  toggleSidebar() {
    // Below the breakpoint the toggle drives the overlay; above it, the rail.
    if (this.isNarrow) {
      this.sidebarMobileOpen = !this.sidebarMobileOpen;
      return;
    }
    this.sidebarCollapsed = !this.sidebarCollapsed;
    if (this.sidebarCollapsed) {
      this.expandedGroup = null;
    }
  }

  @action
  closeMobileSidebar() {
    this.sidebarMobileOpen = false;
  }

  setupSocket() {
    if (
      !this.session.isAuthenticated ||
      this.notificationHandler ||
      this.socketConnectHandler
    )
      return;

    this.notificationHandler = (notification) => {
      this.unreadCount++;
      if (this.showNotifications) {
        this.notifications = [notification, ...this.notifications].slice(0, 10);
      }
    };

    this.socket.setup();
    this.socket.on('newNotification', this.notificationHandler);

    this.socketConnectHandler = () => {
      this.loadUnreadCount();
    };
    this.socket.on('connect', this.socketConnectHandler);
    if (this.socket.socket?.connected) {
      this.loadUnreadCount();
    }
  }

  teardownSocket() {
    if (this.notificationHandler) {
      this.socket.off('newNotification', this.notificationHandler);
      this.notificationHandler = null;
    }
    if (this.socketConnectHandler) {
      this.socket.off('connect', this.socketConnectHandler);
      this.socketConnectHandler = null;
    }

    this.socket.disconnect();

    this.showNotifications = false;
    this.notifications = [];
    this.unreadCount = 0;
  }

  willDestroy() {
    this.teardownSocket();
    if (this.routeDidChangeHandler) {
      this.router.off('routeDidChange', this.routeDidChangeHandler);
      this.routeDidChangeHandler = null;
    }
    if (this.sidebarMedia && this.sidebarMediaHandler) {
      this.sidebarMedia.removeEventListener('change', this.sidebarMediaHandler);
      this.sidebarMediaHandler = null;
    }

    super.willDestroy(...arguments);
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
        const result = await this.auth.fetchJson(
          '/notifications?page=1&limit=10',
        );
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
      await this.auth.fetchJson(`/notifications/${notification.id}/read`, {
        method: 'PATCH',
      });
      notification.isRead = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.notifications = [...this.notifications];

      // Smart Navigation
      this.handleNotificationNavigation(notification);
    } catch (e) {
      console.error(
        '[APP-CTRL] Failed to mark notification as read:',
        e.message,
      );
    }
  }

  handleNotificationNavigation(notification) {
    this.showNotifications = false;
    const { entityType, type } = notification;

    if (entityType === 'lead' || type.includes('LEAD')) {
      this.router.transitionTo('leads');
    } else if (entityType === 'cheque' || type.includes('CHEQUE')) {
      this.router.transitionTo('cheques');
    } else if (entityType === 'lease') {
      this.router.transitionTo('leases');
    } else if (type === 'MAINTENANCE_UPDATE') {
      this.router.transitionTo('maintenance');
    }
  }

  @action
  async markAllRead() {
    try {
      await this.auth.fetchJson('/notifications/read-all', { method: 'PATCH' });
      this.unreadCount = 0;
      this.notifications = this.notifications.map((n) => ({
        ...n,
        isRead: true,
      }));
    } catch (e) {
      console.error(
        '[APP-CTRL] Failed to mark all notifications as read:',
        e.message,
      );
    }
  }

  @tracked showLogoutModal = false;

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
      const parentRoute =
        currentRoute.split('.').slice(0, -1).join('.') || 'dashboard';
      this.router.transitionTo(parentRoute);
    } else {
      this.router.refresh();
    }
  }

  @action
  onSearchInput(e) {
    this.searchQuery = e.target.value;
    this.activeSearchIndex = -1;

    if (this.searchQuery.length < 2) {
      cancelDebounce(this, 'performSearch');
      this.showSearchDropdown = false;
      this.searchResults = null;
      this.searchError = false;
      this.isSearching = false;
      return;
    }

    debounceTask(this, 'performSearch', 300);
  }

  async performSearch() {
    const queryAtTimeOfRequest = this.searchQuery;
    this.isSearching = true;
    this.showSearchDropdown = true;
    this.searchError = false;
    try {
      const result = await this.auth.fetchJson(
        `/search?q=${encodeURIComponent(queryAtTimeOfRequest)}`,
      );
      if (queryAtTimeOfRequest === this.searchQuery) {
        this.searchResults = result?.data ?? result;
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
        this.activeSearchIndex = Math.min(
          this.activeSearchIndex + 1,
          results.length - 1,
        );
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
    cancelDebounce(this, 'performSearch');
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
  logout() {
    this.showLogoutModal = true;
  }

  @action
  closeLogoutModal() {
    this.showLogoutModal = false;
  }

  @action
  async confirmLogout() {
    this.showLogoutModal = false;
    await this.auth.logout();
    this.teardownSocket();
    this.router.transitionTo('login');
  }

  @action
  async exitImpersonation() {
    await this.auth.exitImpersonation();
  }
}
