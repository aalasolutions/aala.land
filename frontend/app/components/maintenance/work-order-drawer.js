import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
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
  @tracked units = [];
  @tracked vendors = [];
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked reasonError = '';

  priorityOptions = PRIORITY_OPTIONS;
  categoryOptions = MAINTENANCE_CATEGORY_OPTIONS;
  statusOptions = MAINTENANCE_STATUS_OPTIONS.filter((o) => o.value);

  constructor(owner, args) {
    super(owner, args);
    this.loadOptions();
  }

  async loadOptions() {
    // Leave the render pass before touching tracked state.
    await Promise.resolve();
    const [unitsJson, vendorsJson] = await Promise.all([
      safeJson(this.auth, '/properties/units?page=1&limit=500', 'MAINT'),
      safeJson(this.auth, '/vendors?page=1&limit=100', 'MAINT'),
    ]);
    if (this.isDestroying || this.isDestroyed) return;
    this.units = unitsJson?.data?.data ?? [];
    this.vendors = vendorsJson?.data?.data ?? [];
  }

  // Draft is keyed to the work order it was made from.
  get form() {
    const source = this.args.workOrder ?? null;
    if (this.draft && this.draftFor === source) return this.draft;
    return formFrom(source);
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
    this.draftFor = this.args.workOrder ?? null;
    this.draft = next;
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.draftFor = null;
    this.errorMsg = '';
    this.reasonError = '';
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;

    const form = this.form;
    if (!form.unitId) {
      this.errorMsg = 'Please select a property before saving the work order.';
      return;
    }
    const reason = form.reason.trim();
    if (this.isCancelling && !reason) {
      this.reasonError = 'A reason is required to cancel a work order.';
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';
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
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
