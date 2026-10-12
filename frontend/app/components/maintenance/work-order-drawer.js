import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import {
  MAINTENANCE_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  MAINTENANCE_CATEGORY_OPTIONS,
} from 'land/constants';
import { toDateOnly } from 'land/utils/local-date';
import { safeJson } from 'land/utils/safe-json';

function formFrom(wo) {
  if (!wo) {
    return {
      title: '',
      description: '',
      priority: 'MEDIUM',
      category: 'OTHER',
      reportedBy: '',
      estimatedCost: '',
      actualCost: '',
      costNotes: '',
      scheduledDate: '',
      unitId: '',
      vendorId: '',
      status: 'OPEN',
      reason: '',
    };
  }
  return {
    title: wo.title,
    description: wo.description,
    priority: wo.priority,
    category: wo.category,
    reportedBy: wo.reportedBy ?? '',
    estimatedCost: wo.estimatedCost ? String(wo.estimatedCost) : '',
    actualCost: wo.actualCost ? String(wo.actualCost) : '',
    costNotes: wo.costNotes ?? '',
    scheduledDate: toDateOnly(wo.scheduledDate),
    unitId: wo.unitId ?? '',
    vendorId: wo.vendorId ?? '',
    status: wo.status || 'OPEN',
    reason: '',
  };
}

export default class MaintenanceWorkOrderDrawerComponent extends Component {
  @service auth;
  @service notifications;

  @tracked draft = null;
  draftFor = null;
  optionsRequest = 0;
  @tracked units = [];
  @tracked vendors = [];
  @tracked isSaving = false;
  @tracked error = null;
  @tracked reasonError = '';

  priorityOptions = PRIORITY_OPTIONS;
  categoryOptions = MAINTENANCE_CATEGORY_OPTIONS;
  statusOptions = MAINTENANCE_STATUS_OPTIONS.filter((o) => o.value);

  // The form mounts on every open, so the lists follow the active region.
  loadOnOpen = modifier(() => {
    this.loadOptions();
  });

  async loadOptions() {
    // Leave the render pass; reads after this are not tracked by the modifier.
    await Promise.resolve();
    if (this.isDestroying || this.isDestroyed) return;
    const request = ++this.optionsRequest;
    const [unitsJson, vendorsJson] = await Promise.all([
      safeJson(this.auth, '/properties/units?page=1&limit=500', 'MAINT'),
      safeJson(this.auth, '/vendors?page=1&limit=100', 'MAINT'),
    ]);
    if (this.isDestroying || this.isDestroyed) return;
    if (request !== this.optionsRequest) return;
    this.units = unitsJson?.data?.data ?? [];
    this.vendors = vendorsJson?.data?.data ?? [];
  }

  // Draft and error are keyed to the record they were made for.
  get source() {
    return this.args.workOrder?.id ?? 'new';
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return formFrom(this.args.workOrder);
  }

  get errorMsg() {
    return this.error?.source === this.source ? this.error.message : '';
  }

  get isEdit() {
    return Boolean(this.args.workOrder);
  }

  get isCancelling() {
    return (
      this.isEdit &&
      this.form.status === 'CANCELLED' &&
      this.args.workOrder.status !== 'CANCELLED'
    );
  }

  get unitOptions() {
    return this.units.map((unit) => ({
      value: unit.id,
      label: `${unit.areaName} / ${unit.assetName} / Property ${unit.unitNumber}`,
    }));
  }

  vendorOptionsFor(category) {
    const vendors =
      category && category !== 'OTHER'
        ? this.vendors.filter((vendor) =>
            Array.isArray(vendor.specialties)
              ? vendor.specialties.includes(category)
              : false,
          )
        : this.vendors;

    return [
      { value: '', label: 'No vendor assigned' },
      ...vendors.map((vendor) => ({
        value: vendor.id,
        label: vendor.specialties?.length
          ? `${vendor.name} (${vendor.specialties.join(', ')})`
          : vendor.name,
      })),
    ];
  }

  get vendorOptions() {
    return this.vendorOptionsFor(this.form.category);
  }

  @action setField(name, value) {
    const next = { ...this.form, [name]: value };

    // Keep the selected vendor valid when the category narrows the vendor list.
    if (name === 'category' && next.vendorId) {
      const valid = this.vendorOptionsFor(value).map((opt) => opt.value);
      if (!valid.includes(next.vendorId)) next.vendorId = '';
    }

    if (name === 'reason') this.reasonError = '';
    this.draftFor = this.source;
    this.draft = next;
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.draftFor = null;
    this.units = [];
    this.vendors = [];
    this.error = null;
    this.reasonError = '';
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;

    const form = this.form;
    const source = this.source;
    if (!form.unitId) {
      this.error = {
        source,
        message: 'Please select a property before saving the work order.',
      };
      return;
    }
    const reason = form.reason.trim();
    if (this.isCancelling && !reason) {
      this.reasonError = 'A reason is required to cancel a work order.';
      return;
    }

    this.isSaving = true;
    this.error = null;
    this.reasonError = '';

    const isEdit = this.isEdit;
    const body = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      category: form.category,
      ...(isEdit ? { status: form.status } : {}),
      ...(this.isCancelling ? { reason } : {}),
      ...(form.estimatedCost
        ? { estimatedCost: parseFloat(form.estimatedCost) }
        : {}),
      ...(form.actualCost ? { actualCost: parseFloat(form.actualCost) } : {}),
      ...(form.costNotes ? { costNotes: form.costNotes } : {}),
      ...(form.scheduledDate ? { scheduledDate: form.scheduledDate } : {}),
      vendorId: form.vendorId || null,
      unitId: form.unitId,
    };

    if (!isEdit && form.reportedBy) {
      body.reportedBy = form.reportedBy;
    }

    try {
      await this.auth.fetchJson(
        isEdit ? `/maintenance/${this.args.workOrder.id}` : '/maintenance',
        { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      this.notifications.success(
        isEdit ? 'Work order updated' : 'Work order created',
      );
      this.close();
      this.args.onSaved?.();
    } catch (e) {
      this.error = { source, message: e.message };
    } finally {
      this.isSaving = false;
    }
  }
}
