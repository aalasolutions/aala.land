import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const MONTH_OPTIONS = [
  { value: '', label: 'All Time' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
];

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const CATEGORY_OPTIONS = [
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'HVAC', label: 'HVAC' },
  { value: 'STRUCTURAL', label: 'Structural' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'PEST_CONTROL', label: 'Pest Control' },
  { value: 'APPLIANCE', label: 'Appliance' },
  { value: 'OTHER', label: 'Other' },
];

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

  statusOptions = STATUS_OPTIONS;

  monthOptions = MONTH_OPTIONS;

  priorityOptions = PRIORITY_OPTIONS;

  categoryOptions = CATEGORY_OPTIONS;

  get unitOptions() {
    return [
      { value: '', label: 'No unit assigned' },
      ...(this.model.units || []).map(unit => ({
        value: unit.id,
        label: `${unit.areaName} / ${unit.assetName} / Unit ${unit.unitNumber}`
      }))
    ];
  }

  get vendorOptions() {
    return [
      { value: '', label: 'No vendor assigned' },
      ...(this.model.vendors || []).map(vendor => ({
        value: vendor.id,
        label: `${vendor.name} (${vendor.specialty})`
      }))
    ];
  }

  get filteredWorkOrders() {
    return this.model?.workOrders || [];
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action setSection(section) { this.activeSection = section; }

  @action setStatusFilter(e) {
    this.filterStatus = e.target.value;
    this.page = 1;
  }

  @action setMonthFilter(e) {
    this.filterMonth = e.target.value;
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
    this.formScheduledDate = wo.scheduledDate ? wo.scheduledDate.split('T')[0] : '';
    this.formUnitId = wo.unitId ?? '';
    this.formVendorId = wo.vendorId ?? '';
    this.formStatus = wo.status || 'OPEN';
    this.editWorkOrder = wo;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editWorkOrder = null;
    this.errorMsg = '';
  }

  @action async saveWorkOrder(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editWorkOrder;
    const path = isEdit ? `/maintenance/${this.editWorkOrder.id}` : '/maintenance';

    const body = {
      title: this.formTitle,
      description: this.formDescription,
      priority: this.formPriority,
      category: this.formCategory,
      ...(isEdit ? { status: this.formStatus } : {}),
      ...(this.formEstimatedCost ? { estimatedCost: parseFloat(this.formEstimatedCost) } : {}),
      ...(this.formActualCost ? { actualCost: parseFloat(this.formActualCost) } : {}),
      ...(this.formCostNotes ? { costNotes: this.formCostNotes } : {}),
      ...(this.formScheduledDate ? { scheduledDate: this.formScheduledDate } : {}),
      ...(this.formVendorId ? { vendorId: this.formVendorId } : {}),
    };

    if (!isEdit) {
      if (this.formReportedBy) body.reportedBy = this.formReportedBy;
      if (this.formUnitId) body.unitId = this.formUnitId;
    }

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Work order updated' : 'Work order created');
      this.closeModal();
      this.router.refresh('maintenance');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
