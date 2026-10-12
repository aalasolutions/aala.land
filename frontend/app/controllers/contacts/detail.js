import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { ROLES } from '../../utils/roles';
import { isLimited } from '../../utils/contact-display';

const HISTORY_ROLES = [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER];

export default class ContactsDetailController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked showEdit = false;
  @tracked tab = null;

  @tracked expandedLeadId = null;
  @tracked leadActivities = {};
  @tracked loadingActivitiesFor = null;

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
      isFixed: 'right',
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

  // Same roles as GET /record-history.
  get canViewHistory() {
    return HISTORY_ROLES.includes(this.auth.currentUser?.role);
  }

  get isLimited() {
    return isLimited(this.model?.contact);
  }

  get relatedTabs() {
    const { leads = [], leases = [], units = [] } = this.model ?? {};
    return [
      leads.length && { id: 'leads', label: 'Leads', count: leads.length },
      leases.length && { id: 'leases', label: 'Leases', count: leases.length },
      units.length && {
        id: 'properties',
        label: 'Properties',
        count: units.length,
      },
      { id: 'documents', label: 'Documents' },
      this.canViewHistory && { id: 'history', label: 'History' },
    ].filter(Boolean);
  }

  get currentTab() {
    const ids = this.relatedTabs.map((t) => t.id);
    if (this.tab && ids.includes(this.tab)) return this.tab;
    return ids[0];
  }

  @action setTab(id) {
    this.tab = id;
  }

  // Cleared only when leaving the route.
  resetTab() {
    this.tab = null;
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

  @action goBack() {
    this.router.transitionTo('contacts.index');
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
