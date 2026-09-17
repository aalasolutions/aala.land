import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { isAdminRole } from '../utils/roles';
import {
  openDeleteModal,
  closeDeleteModal,
  confirmDeleteModal,
} from '../utils/delete-modal';
import {
  MAINTENANCE_STATUS_OPTIONS,
  MONTH_OPTIONS,
  PRIORITY_OPTIONS,
  MAINTENANCE_CATEGORY_OPTIONS,
} from 'land/constants';
import { toDateOnly } from 'land/utils/local-date';

export default class MaintenanceController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit', 'filterStatus', 'filterMonth'];

  @tracked filterStatus = '';
  @tracked filterMonth = '';

  @tracked showModal = false;
  @tracked editWorkOrder = null;
  @tracked formTitle = '';
  @tracked formDescription = '';
  @tracked formPriority = 'MEDIUM';
  @tracked formCategory = 'OTHER';
  @tracked formReportedBy = '';
  @tracked formEstimatedCost = '';
  @tracked formActualCost = '';
  @tracked formCostNotes = '';
  @tracked formScheduledDate = '';
  @tracked formUnitId = '';
  @tracked formVendorId = '';
  @tracked formStatus = 'OPEN';
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked activeSection = 'orders';
  @tracked formReason = '';
  @tracked showDeleteModal = false;
  @tracked workOrderToDelete = null;
  @tracked deleteReason = '';
  @tracked isDeleting = false;
  @tracked reasonError = '';

  statusOptions = MAINTENANCE_STATUS_OPTIONS;

  get isCancellingWorkOrder() {
    return (
      !!this.editWorkOrder &&
      this.formStatus === 'CANCELLED' &&
      this.editWorkOrder.status !== 'CANCELLED'
    );
  }

  // Mirrors the backend delete guard.
  @action canDeleteWorkOrder(wo) {
    return (
      isAdminRole(this.auth.currentUser?.role) &&
      wo.status === 'OPEN' &&
      !wo.vendorId &&
      !Number(wo.actualCost)
    );
  }

  get workOrderStatusOptions() {
    return this.statusOptions.filter((o) => o.value);
  }

  get sectionTabs() {
    return [
      { id: 'orders', label: 'Work Orders' },
      { id: 'upcoming', label: 'Upcoming Preventive' },
    ];
  }

  monthOptions = MONTH_OPTIONS;

  priorityOptions = PRIORITY_OPTIONS;

  categoryOptions = MAINTENANCE_CATEGORY_OPTIONS;

  get unitOptions() {
    return (this.model.units || []).map((unit) => ({
      value: unit.id,
      label: `${unit.areaName} / ${unit.assetName} / Property ${unit.unitNumber}`,
    }));
  }

  get vendorOptions() {
    const selectedCategory = this.formCategory;
    const shouldFilterByCategory =
      selectedCategory && selectedCategory !== 'OTHER';
    const vendors = this.model.vendors || [];

    const filteredVendors = shouldFilterByCategory
      ? vendors.filter((vendor) =>
          Array.isArray(vendor.specialties)
            ? vendor.specialties.includes(selectedCategory)
            : false,
        )
      : vendors;

    return [
      { value: '', label: 'No vendor assigned' },
      ...filteredVendors.map((vendor) => ({
        value: vendor.id,
        label: vendor.specialties?.length
          ? `${vendor.name} (${vendor.specialties.join(', ')})`
          : vendor.name,
      })),
    ];
  }

  get filteredWorkOrders() {
    return this.model?.workOrders || [];
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;

    // Keep selected vendor valid when category changes and vendor options narrow.
    if (fieldName === 'formCategory' && this.formVendorId) {
      const validVendorIds = this.vendorOptions.map((opt) => opt.value);
      if (!validVendorIds.includes(this.formVendorId)) {
        this.formVendorId = '';
      }
    }
  }

  // Nuvo inputs call onInput/onChange as (value, event), not the raw DOM event setField expects.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;

    if (fieldName === 'formReason') {
      this.reasonError = '';
    }

    // Keep selected vendor valid when category changes and vendor options narrow.
    if (fieldName === 'formCategory' && this.formVendorId) {
      const validVendorIds = this.vendorOptions.map((opt) => opt.value);
      if (!validVendorIds.includes(this.formVendorId)) {
        this.formVendorId = '';
      }
    }
  }

  @action setSection(section) {
    this.activeSection = section;
  }

  @action setStatusFilter(value) {
    this.filterStatus = value;
    this.page = 1;
  }

  @action setMonthFilter(value) {
    this.filterMonth = value;
    this.page = 1;
  }

  @action openCreate() {
    this.formTitle = '';
    this.formDescription = '';
    this.formPriority = 'MEDIUM';
    this.formCategory = 'OTHER';
    this.formReportedBy = '';
    this.formEstimatedCost = '';
    this.formActualCost = '';
    this.formCostNotes = '';
    this.formScheduledDate = '';
    this.formUnitId = '';
    this.formVendorId = '';
    this.formStatus = 'OPEN';
    this.editWorkOrder = null;
    this.errorMsg = '';
    this.reasonError = '';
    this.showModal = true;
  }

  @action openEdit(wo) {
    this.formTitle = wo.title;
    this.formDescription = wo.description;
    this.formPriority = wo.priority;
    this.formCategory = wo.category;
    this.formReportedBy = wo.reportedBy ?? '';
    this.formEstimatedCost = wo.estimatedCost ? String(wo.estimatedCost) : '';
    this.formActualCost = wo.actualCost ? String(wo.actualCost) : '';
    this.formCostNotes = wo.costNotes ?? '';
    this.formScheduledDate = toDateOnly(wo.scheduledDate);
    this.formUnitId = wo.unitId ?? '';
    this.formVendorId = wo.vendorId ?? '';
    this.formStatus = wo.status || 'OPEN';
    this.formReason = '';
    this.editWorkOrder = wo;
    this.errorMsg = '';
    this.reasonError = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editWorkOrder = null;
    this.errorMsg = '';
    this.reasonError = '';
  }

  @action async saveWorkOrder(event) {
    event.preventDefault();
    if (this.isSaving) return;

    const isEdit = !!this.editWorkOrder;
    if (!this.formUnitId) {
      this.errorMsg = 'Please select a property before saving the work order.';
      return;
    }
    const reason = this.formReason.trim();
    if (this.isCancellingWorkOrder && !reason) {
      this.reasonError = 'A reason is required to cancel a work order.';
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';
    this.reasonError = '';

    const path = isEdit
      ? `/maintenance/${this.editWorkOrder.id}`
      : '/maintenance';

    const body = {
      title: this.formTitle,
      description: this.formDescription,
      priority: this.formPriority,
      category: this.formCategory,
      ...(isEdit ? { status: this.formStatus } : {}),
      ...(this.isCancellingWorkOrder ? { reason } : {}),
      ...(this.formEstimatedCost
        ? { estimatedCost: parseFloat(this.formEstimatedCost) }
        : {}),
      ...(this.formActualCost
        ? { actualCost: parseFloat(this.formActualCost) }
        : {}),
      ...(this.formCostNotes ? { costNotes: this.formCostNotes } : {}),
      ...(this.formScheduledDate
        ? { scheduledDate: this.formScheduledDate }
        : {}),
      vendorId: this.formVendorId || null,
      unitId: this.formUnitId,
    };

    if (!isEdit && this.formReportedBy) {
      body.reportedBy = this.formReportedBy;
    }

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(
        isEdit ? 'Work order updated' : 'Work order created',
      );
      this.closeModal();
      this.router.refresh('maintenance');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  @action openDelete(wo) {
    this.deleteReason = '';
    this.reasonError = '';
    openDeleteModal(this, 'workOrderToDelete', wo);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'workOrderToDelete');
  }

  @action async confirmDelete() {
    const reason = this.deleteReason.trim();
    if (!reason) {
      this.reasonError = 'Reason is required.';
      return;
    }
    await confirmDeleteModal(this, {
      itemKey: 'workOrderToDelete',
      resourcePath: '/maintenance',
      successMessage: 'Work order deleted',
      refreshRoute: 'maintenance',
      body: { reason },
    });
  }
}
