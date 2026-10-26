import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { canViewRecordHistory } from '../../utils/roles';
import { isLimited } from '../../utils/contact-display';
import { primaryRole } from '../../utils/contact-role';
import { RELATED_PAGE_SIZE, relatedListUrl } from '../../utils/contact-related';

const ROLE_TAB = { lead: 'leads', tenant: 'leases', owner: 'properties' };
const FIRST_PAGES = { leads: 1, leases: 1, properties: 1 };

export default class ContactsDetailController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked showEdit = false;
  @tracked tab = null;

  @tracked expandedLeadId = null;
  @tracked leadActivities = {};
  @tracked loadingActivitiesFor = null;

  @tracked pages = FIRST_PAGES;
  @tracked pagedRows = {};
  pageSize = RELATED_PAGE_SIZE;
  #pageRequests = { leads: 0, leases: 0, properties: 0 };

  unitColumns = [
    { name: 'Unit', valuePath: 'unitNumber', width: 200, isFixed: 'left' },
    { name: 'Area', valuePath: 'areaName', width: 200 },
    { name: 'Type', valuePath: 'propertyType', width: 160 },
    { name: 'Status', valuePath: 'status', width: 140 },
    { name: 'Price', valuePath: 'price', width: 140, numeric: true },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 120,
      isSortable: false,
      isResizable: false,
    },
  ];

  leaseColumns = [
    {
      name: 'Unit',
      valuePath: 'unit.unitNumber',
      width: 200,
      isFixed: 'left',
    },
    { name: 'Status', valuePath: 'status', width: 160 },
    { name: 'Start', valuePath: 'startDate', width: 140 },
    { name: 'End', valuePath: 'endDate', width: 140 },
    { name: 'Rent', valuePath: 'monthlyRent', width: 140, numeric: true },
  ];

  resetEditState() {
    this.showEdit = false;
    this.expandedLeadId = null;
    this.leadActivities = {};
    this.loadingActivitiesFor = null;
  }

  get canViewHistory() {
    return canViewRecordHistory(this.auth.currentUser?.role);
  }

  get isLimited() {
    return isLimited(this.model?.contact);
  }

  get totals() {
    return this.model?.totals ?? {};
  }

  get leadRows() {
    return this.pagedRows.leads ?? this.model?.leads ?? [];
  }

  get leaseRows() {
    return this.pagedRows.leases ?? this.model?.leases ?? [];
  }

  get unitRows() {
    return this.pagedRows.properties ?? this.model?.units ?? [];
  }

  get relatedTabs() {
    const { leads, leases, units } = this.totals;
    return [
      leads && { id: 'leads', label: 'Leads', count: leads },
      leases && { id: 'leases', label: 'Leases', count: leases },
      units && { id: 'properties', label: 'Properties', count: units },
      { id: 'documents', label: 'Documents' },
      this.canViewHistory && { id: 'history', label: 'History' },
    ].filter(Boolean);
  }

  get currentTab() {
    const ids = this.relatedTabs.map((t) => t.id);
    if (this.tab && ids.includes(this.tab)) return this.tab;
    const roleTab = ROLE_TAB[primaryRole(this.model ?? {})];
    return ids.includes(roleTab) ? roleTab : ids[0];
  }

  @action setTab(id) {
    this.tab = id;
  }

  // Cleared only when leaving the route.
  resetTab() {
    this.tab = null;
  }

  resetPages() {
    for (const tab of Object.keys(this.#pageRequests)) {
      this.#pageRequests[tab]++;
    }
    this.pages = FIRST_PAGES;
    this.pagedRows = {};
  }

  // Replaces only this tab's rows; a newer request or a reload discards a late answer.
  @action async goToRelatedPage(tab, page) {
    const contactId = this.model?.contact?.id;
    if (!contactId) return;
    const request = ++this.#pageRequests[tab];
    this.pages = { ...this.pages, [tab]: page };
    const result = await this.auth
      .fetchJson(relatedListUrl(tab, contactId, page))
      .catch(() => null);
    if (request !== this.#pageRequests[tab]) return;
    this.pagedRows = { ...this.pagedRows, [tab]: result?.data?.data || [] };
  }

  // The server grants access on a match; reloading swaps in whatever view it now returns.
  @action onPhoneVerified(contact) {
    this.notifications.success(
      isLimited(contact)
        ? 'Number matched'
        : 'Number matched: full details unlocked',
    );
    this.router.refresh('contacts.detail');
  }

  @action openEdit() {
    this.showEdit = true;
  }

  @action closeEdit() {
    this.showEdit = false;
  }

  @action refresh() {
    this.router.refresh('contacts.detail');
  }

  @action async toggleLeadActivity(leadId) {
    if (this.expandedLeadId === leadId) {
      this.expandedLeadId = null;
      return;
    }
    this.expandedLeadId = leadId;
    if (this.leadActivities[leadId]) return;

    this.loadingActivitiesFor = leadId;
    try {
      const data = await this.auth.fetchJson(`/leads/${leadId}/activities`);
      this.leadActivities = {
        ...this.leadActivities,
        [leadId]: data.data || [],
      };
    } catch (e) {
      console.error('Failed to load lead activities:', e);
      this.leadActivities = { ...this.leadActivities, [leadId]: [] };
    } finally {
      this.loadingActivitiesFor = null;
    }
  }
}
