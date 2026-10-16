import PaginatedController from '../paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { debounceTask } from 'ember-lifeline';
import { modifier } from 'ember-modifier';
import {
  closeDeleteModal,
  confirmDeleteModal,
  openDeleteModal,
} from '../../utils/delete-modal';
import { CONTACT_TAG_LABELS } from '../../helpers/contact-tag-label';
import { formatNumber } from '../../helpers/format-number';
import { canViewContactCompanies, resolveAllRegions } from '../../utils/roles';

export const CONTACTS_TAB = 'contacts';
export const COMPANIES_TAB = 'companies';
export const REQUESTS_TAB = 'requests';

const ROLE_TABS = [
  { id: '', label: 'All' },
  ...Object.entries(CONTACT_TAG_LABELS).map(([id, label]) => ({ id, label })),
];

export default class ContactsIndexController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = [
    'page',
    'limit',
    'search',
    'tag',
    'agentId',
    'isWhatsapp',
    'company',
    'companyExact',
    'region',
    'nationality',
    'dateFrom',
    'dateTo',
    'allRegions',
    'tab',
  ];
  @tracked search = '';
  @tracked tag = '';
  @tracked agentId = '';
  @tracked isWhatsapp = false;
  @tracked company = '';
  @tracked companyExact = '';
  @tracked region = '';
  @tracked nationality = '';
  @tracked dateFrom = '';
  @tracked dateTo = '';
  // Empty means the role default; the toggle writes an explicit 'true' or 'false'.
  @tracked allRegions = '';
  @tracked tab = CONTACTS_TAB;
  @tracked requestedContactIds = [];

  get roleTabs() {
    const counts = this.model?.tagCounts;
    if (!counts) return ROLE_TABS;
    return ROLE_TABS.map((tab) => ({
      ...tab,
      label: `${tab.label} ${formatNumber([counts[tab.id || 'all']])}`,
    }));
  }

  get canViewCompanies() {
    return canViewContactCompanies(this.auth.currentUser?.role);
  }

  get pageTabs() {
    return [
      { id: CONTACTS_TAB, label: 'Contacts' },
      ...(this.canViewCompanies
        ? [{ id: COMPANIES_TAB, label: 'Companies' }]
        : []),
      { id: REQUESTS_TAB, label: 'My requests' },
    ];
  }

  get currentTab() {
    if (this.tab === COMPANIES_TAB && this.canViewCompanies) {
      return COMPANIES_TAB;
    }
    return this.tab === REQUESTS_TAB ? REQUESTS_TAB : CONTACTS_TAB;
  }

  get allRegionsOn() {
    return resolveAllRegions(this.allRegions, this.auth.currentUser?.role);
  }

  columns = [
    { name: 'Name', valuePath: 'displayName', width: 250, isFixed: 'left' },
    { name: 'Role', valuePath: 'tags', width: 220 },
    { name: 'Email', valuePath: 'email', width: 240 },
    { name: 'Phone', valuePath: 'phone', width: 190 },
    { name: 'Company', valuePath: 'contactCompany', width: 170 },
    { name: 'Added by', valuePath: 'createdByName', width: 180 },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 100,
      isFixed: 'right',
      isSortable: false,
      isResizable: false,
    },
  ];

  resetState() {
    this.search = '';
    this.tag = '';
    this.agentId = '';
    this.isWhatsapp = false;
    this.company = '';
    this.companyExact = '';
    this.region = '';
    this.nationality = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.allRegions = '';
    this.tab = CONTACTS_TAB;
    this.requestedContactIds = [];
    this.page = 1;
    this.showModal = false;
    this.editContact = null;
    this.showDeleteModal = false;
    this.contactToDelete = null;
    this.isDeleting = false;
    this.deleteReason = '';
    this.reasonError = '';
  }

  get agentOptions() {
    return [
      { value: '', label: 'Any agent' },
      ...(this.model?.agents || []).map((agent) => ({
        value: agent.id,
        label: agent.name,
      })),
    ];
  }

  get hasActiveFilters() {
    return this.activeFilterCount > 0;
  }

  get activeFilterCount() {
    return [
      this.agentId,
      this.isWhatsapp,
      this.company,
      this.region,
      this.nationality,
      this.dateFrom,
      this.dateTo,
    ].filter(Boolean).length;
  }

  @tracked showModal = false;
  @tracked editContact = null;
  @tracked showDeleteModal = false;
  @tracked contactToDelete = null;
  @tracked isDeleting = false;
  @tracked deleteReason = '';
  @tracked reasonError = '';
  @tracked tableOptionsHost = null;

  // Hands the toolbar slot to the table's Options trigger.
  registerTableOptionsHost = modifier((element) => {
    this.tableOptionsHost = element;
    return () => {
      if (this.tableOptionsHost === element) this.tableOptionsHost = null;
    };
  });

  // Nuvo inputs pass (value, event), not the raw DOM event legacy setField expects.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  @action setTag(tabId) {
    this.tag = tabId;
    this.page = 1;
  }

  @action setTab(tabId) {
    this.tab = tabId;
  }

  @action toggleAllRegions(checked) {
    this.allRegions = checked ? 'true' : 'false';
    this.region = '';
    this.page = 1;
  }

  // The row flips to pending at once; the next list load carries accessPending from the server.
  @action markRequested(contact) {
    if (this.requestedContactIds.includes(contact.id)) return;
    this.requestedContactIds = [...this.requestedContactIds, contact.id];
  }

  @action setAgentFilter(value) {
    this.agentId = value;
    this.page = 1;
  }

  @action toggleWhatsappFilter(checked) {
    this.isWhatsapp = checked;
    this.page = 1;
  }

  @action updateFilter(fieldName, e) {
    debounceTask(this, 'applyFilter', fieldName, e.target.value, 500);
  }

  applyFilter(fieldName, value) {
    this[fieldName] = value;
    // Typing a company is a partial search again, not the exact name a company link set.
    if (fieldName === 'company') this.companyExact = '';
    this.page = 1;
  }

  @action setDateFrom(e) {
    this.dateFrom = e.target.value;
    this.page = 1;
  }

  @action setDateTo(e) {
    this.dateTo = e.target.value;
    this.page = 1;
  }

  @action clearFilters() {
    this.agentId = '';
    this.isWhatsapp = false;
    this.company = '';
    this.companyExact = '';
    this.region = '';
    this.nationality = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.page = 1;
  }

  @action openCreate() {
    this.editContact = null;
    this.showModal = true;
  }

  @action openEdit(contact) {
    this.editContact = contact;
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
    this.editContact = null;
  }

  @action refresh() {
    this.router.refresh('contacts.index');
  }

  @action openDelete(contact) {
    this.deleteReason = '';
    this.reasonError = '';
    openDeleteModal(this, 'contactToDelete', contact);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'contactToDelete');
  }

  @action async confirmDelete() {
    const reason = this.deleteReason.trim();
    if (!reason) {
      this.reasonError = 'Reason is required.';
      return;
    }
    await confirmDeleteModal(this, {
      itemKey: 'contactToDelete',
      resourcePath: '/contacts',
      successMessage: 'Contact deleted',
      refreshRoute: 'contacts.index',
      body: { reason },
    });
  }
}
