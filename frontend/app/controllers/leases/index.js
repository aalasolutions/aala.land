import PaginatedController from '../paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { debounceTask } from 'ember-lifeline';
import {
  LEASE_TYPE_OPTIONS,
  LEASE_STATUS_OPTIONS,
  LEASE_ARCHIVED_OPTIONS,
} from 'land/constants';
import {
  closeDeleteModal,
  confirmDeleteModal,
  openDeleteModal,
} from '../../utils/delete-modal';
import { ROLES, canViewRecordHistory } from '../../utils/roles';

const ARCHIVE_ROLES = [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER];
const DELETE_ROLES = [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN, ROLES.ADMIN];

export default class LeasesController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = [
    'page',
    'limit',
    'status',
    'type',
    'search',
    'dateFrom',
    'dateTo',
    'archived',
  ];
  @tracked archived = '';
  @tracked status = '';
  @tracked type = '';
  @tracked search = '';
  @tracked dateFrom = '';
  @tracked dateTo = '';

  @tracked showModal = false;
  @tracked drawerMode = 'create';
  @tracked drawerLease = null;
  @tracked showTerminateModal = false;
  @tracked leaseToTerminate = null;
  @tracked showDeleteModal = false;
  @tracked leaseToDelete = null;
  @tracked isDeleting = false;
  @tracked deleteReason = '';
  @tracked reasonError = '';
  @tracked showArchiveModal = false;
  @tracked leaseToArchive = null;
  @tracked archiveMode = 'archive';
  @tracked archiveReason = '';
  @tracked isArchiving = false;
  @tracked historyLease = null;

  statusTabs = LEASE_STATUS_OPTIONS;
  archivedTabs = LEASE_ARCHIVED_OPTIONS;

  columns = [
    {
      name: 'Tenant',
      valuePath: 'contact.displayName',
      width: 220,
      isFixed: 'left',
    },
    { name: 'Unit', valuePath: 'unit.unitNumber', width: 140 },
    { name: 'Type', valuePath: 'type', width: 140 },
    { name: 'Rent', valuePath: 'monthlyRent', width: 140, numeric: true },
    { name: 'Period', valuePath: 'startDate', width: 220 },
    { name: 'Status', valuePath: 'status', width: 160 },
    {
      name: 'Tenancy Reg. Ref',
      valuePath: 'tenancyRegistrationRef',
      width: 180,
    },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 160,
      isFixed: 'right',
      isSortable: false,
      isResizable: false,
    },
  ];

  resetState() {
    this.page = 1;
    this.archived = '';
    this.status = '';
    this.type = '';
    this.search = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.showModal = false;
    this.drawerLease = null;
    this.showTerminateModal = false;
    this.leaseToTerminate = null;
    this.showDeleteModal = false;
    this.leaseToDelete = null;
    this.isDeleting = false;
    this.deleteReason = '';
    this.reasonError = '';
    this.showArchiveModal = false;
    this.leaseToArchive = null;
    this.archiveReason = '';
    this.isArchiving = false;
    this.historyLease = null;
  }

  get hasActiveFilters() {
    return Boolean(
      this.type || this.search || this.dateFrom || this.dateTo || this.archived,
    );
  }

  get canArchiveLease() {
    return ARCHIVE_ROLES.includes(this.auth.currentUser?.role);
  }

  get canDeleteLease() {
    return DELETE_ROLES.includes(this.auth.currentUser?.role);
  }

  get canViewHistory() {
    return canViewRecordHistory(this.auth.currentUser?.role);
  }

  get typeFilterOptions() {
    return [{ value: '', label: 'All types' }, ...LEASE_TYPE_OPTIONS];
  }

  // Nuvo inputs call onInput/onChange as (value, event), not the raw DOM event setField expects.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  @action setArchivedTab(tabId) {
    this.archived = tabId;
    this.page = 1;
  }

  @action setStatusTab(tabId) {
    this.status = tabId;
    this.page = 1;
  }

  @action setType(value) {
    this.type = value;
    this.page = 1;
  }

  @action updateFilter(fieldName, e) {
    debounceTask(this, 'applyFilter', fieldName, e.target.value, 500);
  }

  applyFilter(fieldName, value) {
    this[fieldName] = value;
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
    this.type = '';
    this.search = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.archived = '';
    this.page = 1;
  }

  @action openCreate() {
    this.openDrawer('create', null);
  }

  @action openEdit(lease) {
    this.openDrawer('edit', lease);
  }

  @action renewLease(lease) {
    this.openDrawer('renew', lease);
  }

  openDrawer(mode, lease) {
    this.drawerMode = mode;
    this.drawerLease = lease;
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
    this.drawerLease = null;
  }

  @action openTerminate(lease) {
    this.leaseToTerminate = lease;
    this.showTerminateModal = true;
  }

  @action closeTerminateModal() {
    this.showTerminateModal = false;
    this.leaseToTerminate = null;
  }

  @action refresh() {
    this.router.refresh('leases');
  }

  @action openDelete(lease) {
    this.deleteReason = '';
    this.reasonError = '';
    openDeleteModal(this, 'leaseToDelete', lease);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'leaseToDelete');
  }

  @action async confirmDelete() {
    const reason = this.deleteReason.trim();
    if (!reason) {
      this.reasonError = 'Reason is required.';
      return;
    }
    await confirmDeleteModal(this, {
      itemKey: 'leaseToDelete',
      resourcePath: '/leases',
      successMessage: 'Lease deleted',
      refreshRoute: 'leases',
      body: { reason },
    });
  }

  @action openArchive(lease, mode) {
    this.leaseToArchive = lease;
    this.archiveMode = mode;
    this.archiveReason = '';
    this.reasonError = '';
    this.showArchiveModal = true;
  }

  @action closeArchiveModal() {
    this.showArchiveModal = false;
    this.leaseToArchive = null;
  }

  @action async confirmArchive() {
    if (!this.leaseToArchive || this.isArchiving) return;
    const isArchive = this.archiveMode === 'archive';
    const reason = this.archiveReason.trim();
    if (isArchive && !reason) {
      this.reasonError = 'Reason is required.';
      return;
    }

    this.isArchiving = true;
    try {
      await this.auth.fetchJson(
        `/leases/${this.leaseToArchive.id}/${this.archiveMode}`,
        {
          method: 'POST',
          body: JSON.stringify(reason ? { reason } : {}),
        },
      );
      this.notifications.success(
        isArchive ? 'Lease archived' : 'Lease unarchived',
      );
      this.closeArchiveModal();
      this.router.refresh('leases');
    } catch (e) {
      this.notifications.error(
        e.message ||
          (isArchive ? 'Failed to archive lease' : 'Failed to unarchive lease'),
      );
    } finally {
      this.isArchiving = false;
    }
  }

  @action openHistory(lease) {
    this.historyLease = lease;
  }

  @action closeHistory() {
    this.historyLease = null;
  }
}
