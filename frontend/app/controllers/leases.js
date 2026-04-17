import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default class LeasesController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked showModal = false;
  @tracked editLease = null;
  @tracked formTenantName = '';
  @tracked formTenantEmail = '';
  @tracked formTenantPhone = '';
  @tracked formUnitId = '';
  @tracked formType = 'RESIDENTIAL';
  @tracked formStartDate = '';
  @tracked formEndDate = '';
  @tracked formMonthlyRent = '';
  @tracked formSecurityDeposit = '';
  @tracked formNumberOfCheques = '4';
  @tracked formEjariNumber = '';
  @tracked renewingLeaseId = null;
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked showTerminateModal = false;
  @tracked leaseToTerminate = null;
  @tracked isTerminating = false;

  get leaseTypeOptions() {
    return [
      { value: 'RESIDENTIAL', label: 'Residential' },
      { value: 'COMMERCIAL', label: 'Commercial' }
    ];
  }

  get unitOptions() {
    return [
      { value: '', label: 'Select a unit...' },
      ...(this.model.units || []).map(unit => ({
        value: unit.id,
        label: `${unit.areaName} - ${unit.assetName} - Unit ${unit.unitNumber}${unit.floorNumber ? ` (Floor ${unit.floorNumber})` : ''}`
      }))
    ];
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action openCreate() {
    this.formTenantName = '';
    this.formTenantEmail = '';
    this.formTenantPhone = '';
    this.formUnitId = '';
    this.formType = 'RESIDENTIAL';
    this.formStartDate = '';
    this.formEndDate = '';
    this.formMonthlyRent = '';
    this.formSecurityDeposit = '';
    this.formNumberOfCheques = '4';
    this.formEjariNumber = '';
    this.editLease = null;
    this.renewingLeaseId = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(lease) {
    this.formTenantName = lease.tenantName;
    this.formTenantEmail = lease.tenantEmail ?? '';
    this.formTenantPhone = lease.tenantPhone ?? '';
    this.formUnitId = lease.unitId ?? '';
    this.formType = lease.type ?? 'RESIDENTIAL';
    this.formStartDate = lease.startDate ? lease.startDate.split('T')[0] : '';
    this.formEndDate = lease.endDate ? lease.endDate.split('T')[0] : '';
    this.formMonthlyRent = String(lease.monthlyRent);
    this.formSecurityDeposit = lease.securityDeposit ? String(lease.securityDeposit) : '';
    this.formNumberOfCheques = String(lease.numberOfCheques ?? 4);
    this.formEjariNumber = lease.ejariNumber ?? '';
    this.editLease = lease;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editLease = null;
    this.renewingLeaseId = null;
    this.errorMsg = '';
  }

  @action async saveLease(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.errorMsg = '';

    const isEdit = !!this.editLease;
    const isRenew = !!this.renewingLeaseId;

    if (!isEdit && !UUID_PATTERN.test(this.formUnitId)) {
      this.errorMsg = 'Please select a valid unit.';
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
          tenantName: this.formTenantName,
          ...(this.formTenantEmail ? { tenantEmail: this.formTenantEmail } : {}),
          ...(this.formTenantPhone ? { tenantPhone: this.formTenantPhone } : {}),
          type: this.formType,
          startDate: this.formStartDate,
          endDate: this.formEndDate,
          monthlyRent: parseFloat(this.formMonthlyRent),
          ...(this.formSecurityDeposit ? { securityDeposit: parseFloat(this.formSecurityDeposit) } : {}),
          numberOfCheques: parseInt(this.formNumberOfCheques, 10),
          ...(this.formEjariNumber ? { ejariNumber: this.formEjariNumber } : {}),
        }
      : {
          tenantName: this.formTenantName,
          ...(this.formTenantEmail ? { tenantEmail: this.formTenantEmail } : {}),
          ...(this.formTenantPhone ? { tenantPhone: this.formTenantPhone } : {}),
          ...(this.formUnitId ? { unitId: this.formUnitId } : {}),
          type: this.formType,
          startDate: this.formStartDate,
          endDate: this.formEndDate,
          monthlyRent: parseFloat(this.formMonthlyRent),
          ...(this.formSecurityDeposit ? { securityDeposit: parseFloat(this.formSecurityDeposit) } : {}),
          numberOfCheques: parseInt(this.formNumberOfCheques, 10),
          ...(this.formEjariNumber ? { ejariNumber: this.formEjariNumber } : {}),
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
    this.formTenantName = lease.tenantName;
    this.formTenantEmail = lease.tenantEmail ?? '';
    this.formTenantPhone = lease.tenantPhone ?? '';
    this.formUnitId = lease.unitId ?? '';
    this.formType = lease.type ?? 'RESIDENTIAL';
    this.formStartDate = lease.endDate ? lease.endDate.split('T')[0] : '';
    this.formEndDate = '';
    this.formMonthlyRent = String(lease.monthlyRent);
    this.formSecurityDeposit = lease.securityDeposit ? String(lease.securityDeposit) : '';
    this.formNumberOfCheques = String(lease.numberOfCheques ?? 4);
    this.formEjariNumber = '';
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
      await this.auth.fetchJson(`/leases/${this.leaseToTerminate.id}/terminate`, { method: 'POST' });
      this.notifications.success('Lease terminated');
      this.closeTerminateModal();
      this.router.refresh('leases');
    } catch (e) {
      this.notifications.error(e.message || 'Failed to terminate lease');
    } finally {
      this.isTerminating = false;
    }
  }
}
