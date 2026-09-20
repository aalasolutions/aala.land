import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { debounceTask } from 'ember-lifeline';
import {
  UUID_PATTERN,
  LEASE_TYPE_OPTIONS,
  LEASE_STATUS_OPTIONS,
  LEASE_ARCHIVED_OPTIONS,
} from 'land/constants';
import {
  closeDeleteModal,
  confirmDeleteModal,
  openDeleteModal,
} from '../utils/delete-modal';
import { ROLES } from '../utils/roles';
import { toDateOnly } from '../utils/local-date';

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
  @tracked editLease = null;
  @tracked formTenantContactId = '';
  @tracked formUnitId = '';
  @tracked formType = 'RESIDENTIAL';
  @tracked formStartDate = '';
  @tracked formEndDate = '';
  @tracked formMonthlyRent = '';
  @tracked formSecurityDeposit = '';
  @tracked formNumberOfCheques = '4';
  @tracked formTenancyRegistrationRef = '';
  @tracked formNotes = '';
  @tracked renewingLeaseId = null;
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked showTerminateModal = false;
  @tracked leaseToTerminate = null;
  @tracked isTerminating = false;
  @tracked formStatus = '';
  @tracked showDeleteModal = false;
  @tracked leaseToDelete = null;
  @tracked isDeleting = false;
  @tracked terminateReason = '';
  @tracked deleteReason = '';
  @tracked reasonError = '';
  @tracked showArchiveModal = false;
  @tracked leaseToArchive = null;
  @tracked archiveMode = 'archive';
  @tracked archiveReason = '';
  @tracked isArchiving = false;
  @tracked historyLease = null;

  leaseTypeOptions = LEASE_TYPE_OPTIONS;
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
    { name: 'Rent', valuePath: 'monthlyRent', width: 140 },
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
      width: 360,
      isFixed: 'right',
      isSortable: false,
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
    this.editLease = null;
    this.renewingLeaseId = null;
    this.errorMsg = '';
    this.showTerminateModal = false;
    this.leaseToTerminate = null;
    this.isTerminating = false;
    this.showDeleteModal = false;
    this.leaseToDelete = null;
    this.isDeleting = false;
    this.terminateReason = '';
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

  get editLeaseUnitArchivedMessage() {
    if (!this.editLease?.unit?.deletedAt) return '';
    return this.editLease.status === 'DRAFT'
      ? 'This unit is archived and no longer active. Select another unit.'
      : 'This unit is archived. Its leases can no longer be edited.';
  }

  get canArchiveLease() {
    return ARCHIVE_ROLES.includes(this.auth.currentUser?.role);
  }

  get canDeleteLease() {
    return DELETE_ROLES.includes(this.auth.currentUser?.role);
  }

  // Same roles as GET /record-history.
  get canViewHistory() {
    return ARCHIVE_ROLES.includes(this.auth.currentUser?.role);
  }

  get typeFilterOptions() {
    return [{ value: '', label: 'All types' }, ...LEASE_TYPE_OPTIONS];
  }

  get unitOptions() {
    return [
      { value: '', label: 'Select a property...' },
      ...(this.model.units || []).map((unit) => ({
        value: unit.id,
        label: `${unit.areaName} - ${unit.assetName} - Property ${unit.unitNumber}${unit.floorNumber ? ` (Floor ${unit.floorNumber})` : ''}`,
      })),
    ];
  }

  // The tenant is a contact (identity lives on the contact).
  get tenantOptions() {
    return [
      { value: '', label: 'Select a tenant...' },
      ...(this.model.contacts || []).map((contact) => ({
        value: contact.id,
        label: contact.displayName,
      })),
    ];
  }

  get validNextStatuses() {
    const current = this.editLease?.status;
    const map = {
      DRAFT: ['DRAFT', 'ACTIVE'],
      ACTIVE: ['ACTIVE', 'EXPIRED'],
      EXPIRED: ['ACTIVE', 'EXPIRED'],
      TERMINATED: ['TERMINATED'],
      RENEWED: ['RENEWED'],
    };
    const statuses = map[current] ?? (current ? [current] : []);
    return statuses.map((s) => ({ value: s, label: s }));
  }

  // Nuvo inputs call onInput/onChange as (value, event), not the raw DOM event setField expects.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  // Native <input type="date"> still emits a raw DOM event.
  @action setFieldValueFromEvent(fieldName, event) {
    this[fieldName] = event.target.value;
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
    this.formTenantContactId = '';
    this.formUnitId = '';
    this.formType = 'RESIDENTIAL';
    this.formStartDate = '';
    this.formEndDate = '';
    this.formMonthlyRent = '';
    this.formSecurityDeposit = '';
    this.formNumberOfCheques = '4';
    this.formTenancyRegistrationRef = '';
    this.formNotes = '';
    this.editLease = null;
    this.renewingLeaseId = null;
    this.errorMsg = '';
    this.formStatus = '';
    this.showModal = true;
  }

  @action openEdit(lease) {
    this.formTenantContactId = lease.contactId ?? lease.contact?.id ?? '';
    this.formUnitId = lease.unitId ?? '';
    this.formType = lease.type ?? 'RESIDENTIAL';
    this.formStartDate = toDateOnly(lease.startDate);
    this.formEndDate = toDateOnly(lease.endDate);
    this.formMonthlyRent = String(lease.monthlyRent);
    this.formSecurityDeposit = lease.securityDeposit
      ? String(lease.securityDeposit)
      : '';
    this.formNumberOfCheques = String(lease.numberOfCheques ?? 4);
    this.formTenancyRegistrationRef = lease.tenancyRegistrationRef ?? '';
    this.formNotes = lease.notes ?? '';
    this.editLease = lease;
    this.formStatus = lease.status ?? 'DRAFT';
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
    this.editLease = null;
    this.renewingLeaseId = null;
    this.errorMsg = '';
    this.formStatus = '';
  }

  @action async saveLease(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.errorMsg = '';

    const isEdit = !!this.editLease;
    const isRenew = !!this.renewingLeaseId;

    if (!isEdit && !UUID_PATTERN.test(this.formUnitId)) {
      this.errorMsg = 'Please select a valid property.';
      return;
    }

    // Nuvo dropdown's `required` isn't native-validated, so tenant presence is enforced here.
    if (!isEdit && !UUID_PATTERN.test(this.formTenantContactId)) {
      this.errorMsg = 'Please select a tenant.';
      return;
    }

    this.isSaving = true;
    let path;
    let method;

    if (isEdit) {
      path = `/leases/${this.editLease.id}`;
      method = 'PATCH';
    } else if (isRenew) {
      path = `/leases/${this.renewingLeaseId}/renew`;
      method = 'POST';
    } else {
      path = '/leases';
      method = 'POST';
    }

    const body = isEdit
      ? {
          ...(this.formTenantContactId
            ? { contactId: this.formTenantContactId }
            : {}),
          ...(this.formUnitId && this.formUnitId !== this.editLease.unitId
            ? { unitId: this.formUnitId }
            : {}),
          type: this.formType,
          startDate: this.formStartDate,
          endDate: this.formEndDate,
          monthlyRent: parseFloat(this.formMonthlyRent),
          ...(this.formSecurityDeposit
            ? { securityDeposit: parseFloat(this.formSecurityDeposit) }
            : {}),
          numberOfCheques: parseInt(this.formNumberOfCheques, 10),
          ...(this.formTenancyRegistrationRef
            ? { tenancyRegistrationRef: this.formTenancyRegistrationRef }
            : {}),
          ...(this.formNotes ? { notes: this.formNotes } : {}),
          status: this.formStatus,
        }
      : {
          ...(this.formTenantContactId
            ? { contactId: this.formTenantContactId }
            : {}),
          ...(this.formUnitId ? { unitId: this.formUnitId } : {}),
          type: this.formType,
          startDate: this.formStartDate,
          endDate: this.formEndDate,
          monthlyRent: parseFloat(this.formMonthlyRent),
          ...(this.formSecurityDeposit
            ? { securityDeposit: parseFloat(this.formSecurityDeposit) }
            : {}),
          numberOfCheques: parseInt(this.formNumberOfCheques, 10),
          ...(this.formTenancyRegistrationRef
            ? { tenancyRegistrationRef: this.formTenancyRegistrationRef }
            : {}),
          ...(this.formNotes ? { notes: this.formNotes } : {}),
        };

    let successMsg = 'Lease created';
    if (isEdit) successMsg = 'Lease updated';
    if (isRenew) successMsg = 'Lease renewed';

    try {
      await this.auth.fetchJson(path, {
        method,
        body: JSON.stringify(body),
      });
      this.notifications.success(successMsg);
      this.closeModal();
      this.router.refresh('leases');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  @action renewLease(lease) {
    this.formTenantContactId = lease.contactId ?? lease.contact?.id ?? '';
    this.formUnitId = lease.unitId ?? '';
    this.formType = lease.type ?? 'RESIDENTIAL';
    this.formStartDate = toDateOnly(lease.endDate);
    this.formEndDate = '';
    this.formMonthlyRent = String(lease.monthlyRent);
    this.formSecurityDeposit = lease.securityDeposit
      ? String(lease.securityDeposit)
      : '';
    this.formNumberOfCheques = String(lease.numberOfCheques ?? 4);
    this.formTenancyRegistrationRef = '';
    this.formNotes = '';
    this.editLease = null;
    this.renewingLeaseId = lease.id;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openTerminate(lease) {
    this.leaseToTerminate = lease;
    this.terminateReason = '';
    this.reasonError = '';
    this.showTerminateModal = true;
  }

  @action closeTerminateModal() {
    this.showTerminateModal = false;
    this.leaseToTerminate = null;
  }

  @action async confirmTerminate() {
    if (!this.leaseToTerminate || this.isTerminating) return;
    const reason = this.terminateReason.trim();
    if (!reason) {
      this.reasonError = 'Reason is required.';
      return;
    }

    this.isTerminating = true;
    try {
      await this.auth.fetchJson(
        `/leases/${this.leaseToTerminate.id}/terminate`,
        { method: 'POST', body: JSON.stringify({ reason }) },
      );
      this.notifications.success('Lease terminated');
      this.closeTerminateModal();
      this.router.refresh('leases');
    } catch (e) {
      this.notifications.error(e.message || 'Failed to terminate lease');
    } finally {
      this.isTerminating = false;
    }
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
