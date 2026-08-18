import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { debounceTask } from 'ember-lifeline';
import {
  UUID_PATTERN,
  LEASE_TYPE_OPTIONS,
  LEASE_STATUS_OPTIONS,
} from 'land/constants';
import {
  closeDeleteModal,
  confirmDeleteModal,
  openDeleteModal,
} from '../utils/delete-modal';

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
  ];
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
  @tracked formEjariNumber = '';
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

  leaseTypeOptions = LEASE_TYPE_OPTIONS;
  statusTabs = LEASE_STATUS_OPTIONS;

  resetState() {
    this.page = 1;
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
  }

  get hasActiveFilters() {
    return Boolean(this.type || this.search || this.dateFrom || this.dateTo);
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
      ACTIVE: ['DRAFT', 'ACTIVE', 'EXPIRED'],
      EXPIRED: ['ACTIVE', 'EXPIRED'],
      TERMINATED: ['TERMINATED'],
      RENEWED: ['RENEWED'],
    };
    const statuses = map[current] ?? (current ? [current] : []);
    return statuses.map((s) => ({ value: s, label: s }));
  }

  // Nuvo::Input/Select/Textarea call onInput/onChange as (value, event),
  // not the raw DOM event setField expects.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  // Native <input type="date"> still emits a raw DOM event.
  @action setFieldValueFromEvent(fieldName, event) {
    this[fieldName] = event.target.value;
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
    this.formEjariNumber = '';
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
    this.formStartDate = lease.startDate ? lease.startDate.split('T')[0] : '';
    this.formEndDate = lease.endDate ? lease.endDate.split('T')[0] : '';
    this.formMonthlyRent = String(lease.monthlyRent);
    this.formSecurityDeposit = lease.securityDeposit
      ? String(lease.securityDeposit)
      : '';
    this.formNumberOfCheques = String(lease.numberOfCheques ?? 4);
    this.formEjariNumber = lease.ejariNumber ?? '';
    this.formNotes = lease.notes ?? '';
    this.editLease = lease;
    this.formStatus = lease.status ?? 'DRAFT';
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
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

    // A new lease must name a tenant. The Nuvo dropdown's `required` is not
    // native-validated, so enforce it here or the body omits contactId and the
    // lease is created with a blank tenant.
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
          type: this.formType,
          startDate: this.formStartDate,
          endDate: this.formEndDate,
          monthlyRent: parseFloat(this.formMonthlyRent),
          ...(this.formSecurityDeposit
            ? { securityDeposit: parseFloat(this.formSecurityDeposit) }
            : {}),
          numberOfCheques: parseInt(this.formNumberOfCheques, 10),
          ...(this.formEjariNumber
            ? { ejariNumber: this.formEjariNumber }
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
          ...(this.formEjariNumber
            ? { ejariNumber: this.formEjariNumber }
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
    this.formStartDate = lease.endDate ? lease.endDate.split('T')[0] : '';
    this.formEndDate = '';
    this.formMonthlyRent = String(lease.monthlyRent);
    this.formSecurityDeposit = lease.securityDeposit
      ? String(lease.securityDeposit)
      : '';
    this.formNumberOfCheques = String(lease.numberOfCheques ?? 4);
    this.formEjariNumber = '';
    this.formNotes = '';
    this.editLease = null;
    this.renewingLeaseId = lease.id;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openTerminate(lease) {
    this.leaseToTerminate = lease;
    this.showTerminateModal = true;
  }

  @action closeTerminateModal() {
    this.showTerminateModal = false;
    this.leaseToTerminate = null;
  }

  @action async confirmTerminate() {
    if (!this.leaseToTerminate || this.isTerminating) return;

    this.isTerminating = true;
    try {
      await this.auth.fetchJson(
        `/leases/${this.leaseToTerminate.id}/terminate`,
        { method: 'POST' },
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
    openDeleteModal(this, 'leaseToDelete', lease);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'leaseToDelete');
  }

  @action async confirmDelete() {
    await confirmDeleteModal(this, {
      itemKey: 'leaseToDelete',
      resourcePath: '/leases',
      successMessage: 'Lease deleted',
      refreshRoute: 'leases',
    });
  }
}
