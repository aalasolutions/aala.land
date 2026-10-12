import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import {
  UUID_PATTERN,
  LEASE_TYPE_OPTIONS,
  PROPERTY_SUB_TYPES,
} from 'land/constants';
import { addCalendarDays, toDateOnly } from 'land/utils/local-date';
import { safeJson } from 'land/utils/safe-json';
import ContactSelection, {
  CONTACT_REQUIRED_ERROR,
} from 'land/utils/contact-selection';

const NEXT_STATUSES = {
  DRAFT: ['DRAFT', 'ACTIVE'],
  ACTIVE: ['ACTIVE', 'EXPIRED'],
  EXPIRED: ['ACTIVE', 'EXPIRED'],
  TERMINATED: ['TERMINATED'],
  RENEWED: ['RENEWED'],
};

function formFrom(lease, mode) {
  if (!lease || mode === 'create') {
    return {
      unitId: '',
      type: 'RESIDENTIAL',
      startDate: '',
      endDate: '',
      monthlyRent: '',
      securityDeposit: '',
      numberOfCheques: '1',
      tenancyRegistrationRef: '',
      notes: '',
      status: '',
    };
  }
  const isRenew = mode === 'renew';
  return {
    unitId: lease.unitId ?? '',
    type: lease.type ?? 'RESIDENTIAL',
    startDate: isRenew
      ? (addCalendarDays(toDateOnly(lease.endDate), 1) ?? '')
      : toDateOnly(lease.startDate),
    endDate: isRenew ? '' : toDateOnly(lease.endDate),
    monthlyRent: String(lease.monthlyRent),
    securityDeposit: lease.securityDeposit ? String(lease.securityDeposit) : '',
    numberOfCheques: String(lease.numberOfCheques ?? 1),
    tenancyRegistrationRef: isRenew ? '' : (lease.tenancyRegistrationRef ?? ''),
    notes: isRenew ? '' : (lease.notes ?? ''),
    status: isRenew ? '' : (lease.status ?? 'DRAFT'),
  };
}

// @mode: create, edit or renew.
export default class LeasesLeaseDrawerComponent extends Component {
  @service auth;
  @service notifications;

  @tracked draft = null;
  @tracked units = [];
  @tracked isSaving = false;
  @tracked error = null;

  @tracked selectionEpoch = 0;

  draftFor = null;
  unitsRequest = 0;
  leaseTypeOptions = LEASE_TYPE_OPTIONS;

  // The form mounts on every open, so the list follows the active region.
  loadOnOpen = modifier(() => {
    this.loadUnits();
  });

  async loadUnits() {
    // Leave the render pass; reads after this are not tracked by the modifier.
    await Promise.resolve();
    if (this.isDestroying || this.isDestroyed) return;
    const request = ++this.unitsRequest;
    const json = await safeJson(
      this.auth,
      '/properties/units?page=1&limit=100',
      'LEASES',
    );
    if (this.isDestroying || this.isDestroyed) return;
    if (request !== this.unitsRequest) return;
    this.units = json?.data?.data ?? [];
  }

  get mode() {
    return this.args.mode ?? 'create';
  }

  get isEdit() {
    return this.mode === 'edit' && Boolean(this.args.lease);
  }

  get isRenew() {
    return this.mode === 'renew' && Boolean(this.args.lease);
  }

  // Draft is keyed to mode and lease.
  get source() {
    return `${this.mode}:${this.args.lease?.id ?? ''}`;
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return formFrom(this.args.lease, this.mode);
  }

  // Rebuilt per record, mode and close.
  @cached
  get tenantSelection() {
    this.selectionEpoch;
    const selection = new ContactSelection();
    if (this.mode !== 'create') selection.attach(this.args.lease?.contact);
    return selection;
  }

  get errorMsg() {
    return this.error?.source === this.source ? this.error.message : '';
  }

  set errorMsg(message) {
    this.error = message ? { source: this.source, message } : null;
  }

  get title() {
    if (this.isEdit) return 'Edit Lease';
    return this.isRenew ? 'Renew Lease' : 'New Lease';
  }

  get submitLabel() {
    if (this.isSaving) return 'Saving...';
    if (this.isEdit) return 'Update';
    return this.isRenew ? 'Renew Lease' : 'Create Lease';
  }

  // For lease reads without the unit relation.
  get unitArchivedMessage() {
    const lease = this.args.lease;
    if (!this.isEdit || !(lease.unit?.deletedAt || this.args.unitArchived)) {
      return '';
    }
    return lease.status === 'DRAFT'
      ? 'This unit is archived and no longer active. Select another unit.'
      : 'This unit is archived. Its leases can no longer be edited.';
  }

  get unitOptions() {
    return [
      { value: '', label: 'Select a property...' },
      ...this.units.map((unit) => ({
        value: unit.id,
        label: `${unit.areaName} - ${unit.assetName} - Property ${unit.unitNumber}${unit.floorNumber ? ` (Floor ${unit.floorNumber})` : ''}`,
      })),
    ];
  }

  get statusOptions() {
    const current = this.args.lease?.status;
    const statuses = NEXT_STATUSES[current] ?? (current ? [current] : []);
    return statuses.map((s) => ({ value: s, label: s }));
  }

  leaseTypeFor(unitId) {
    const unit = this.units.find((u) => u.id === unitId);
    return (
      PROPERTY_SUB_TYPES.find((k) => k.value === unit?.subType)?.leaseType ??
      null
    );
  }

  get unitLeaseType() {
    return this.leaseTypeFor(this.form.unitId);
  }

  get tenantFields() {
    const selection = this.tenantSelection;
    if (selection.contactId) return { contactId: selection.contactId };
    return selection.hasIdentity ? { tenant: selection.cleanIdentity } : {};
  }

  @action setField(name, value) {
    this.draftFor = this.source;
    this.draft = { ...this.form, [name]: value };
  }

  // Native <input type="date"> still emits a raw DOM event.
  @action setFieldFromEvent(name, event) {
    this.setField(name, event.target.value);
  }

  @action selectUnit(unitId) {
    const type = this.leaseTypeFor(unitId);
    this.draftFor = this.source;
    this.draft = { ...this.form, unitId, ...(type ? { type } : {}) };
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.draftFor = null;
    this.units = [];
    this.selectionEpoch += 1;
    this.errorMsg = '';
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.errorMsg = '';

    const form = this.form;
    const isEdit = this.isEdit;
    const isRenew = this.isRenew;
    const lease = this.args.lease;

    if (!isEdit && !UUID_PATTERN.test(form.unitId)) {
      this.errorMsg = 'Please select a valid property.';
      return;
    }

    if (!this.tenantSelection.isPresent) {
      this.errorMsg = CONTACT_REQUIRED_ERROR;
      return;
    }

    const cheques = Number(form.numberOfCheques);
    if (!Number.isInteger(cheques) || cheques < 1) {
      this.errorMsg = 'Enter the number of cheques, 1 or more.';
      return;
    }

    this.isSaving = true;

    let path = '/leases';
    let method = 'POST';
    if (isEdit) {
      path = `/leases/${lease.id}`;
      method = 'PATCH';
    } else if (isRenew) {
      path = `/leases/${lease.id}/renew`;
    }

    const sendUnit = isEdit
      ? form.unitId && form.unitId !== lease.unitId
      : Boolean(form.unitId);

    const body = {
      ...this.tenantFields,
      ...(sendUnit ? { unitId: form.unitId } : {}),
      type: form.type,
      startDate: form.startDate,
      endDate: form.endDate,
      monthlyRent: parseFloat(form.monthlyRent),
      ...(form.securityDeposit
        ? { securityDeposit: parseFloat(form.securityDeposit) }
        : {}),
      numberOfCheques: cheques,
      ...(form.tenancyRegistrationRef
        ? { tenancyRegistrationRef: form.tenancyRegistrationRef }
        : {}),
      ...(form.notes ? { notes: form.notes } : {}),
      ...(isEdit ? { status: form.status } : {}),
    };

    let successMsg = 'Lease created';
    if (isEdit) successMsg = 'Lease updated';
    if (isRenew) successMsg = 'Lease renewed';

    try {
      const result = await this.auth.fetchJson(path, {
        method,
        body: JSON.stringify(body),
      });
      this.notifications.success(successMsg);
      this.close();
      this.args.onSaved?.(result?.data ?? null);
    } catch (e) {
      this.errorMsg = this.tenantSelection.takeConflict(e)
        ? 'Contact already added'
        : e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
