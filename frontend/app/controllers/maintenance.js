import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class MaintenanceController extends Controller {
  @service auth;
  @service notifications;
  @service router;

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
  @tracked formVendorId = '';
  @tracked formStatus = 'PENDING';
  @tracked isSaving = false;
  @tracked errorMsg = '';

  @tracked filterStatus = 'all';
  @tracked filterMonth = 'all';
  @tracked activeSection = 'orders';

  statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  monthOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'last_3_months', label: 'Last 3 Months' },
  ];

  get filteredWorkOrders() {
    let orders = this.model?.workOrders || [];

    if (this.filterStatus !== 'all') {
      orders = orders.filter(wo => wo.status === this.filterStatus);
    }

    if (this.filterMonth !== 'all') {
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();

      orders = orders.filter(wo => {
        if (!wo.scheduledDate && !wo.createdAt) return false;
        const date = new Date(wo.scheduledDate || wo.createdAt);
        const orderMonth = date.getMonth();
        const orderYear = date.getFullYear();

        switch (this.filterMonth) {
          case 'this_month':
            return orderMonth === thisMonth && orderYear === thisYear;
          case 'last_month': {
            const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
            const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
            return orderMonth === lastMonth && orderYear === lastMonthYear;
          }
          case 'last_3_months': {
            const threeMonthsAgo = new Date(thisYear, thisMonth - 3, 1);
            return date >= threeMonthsAgo;
          }
          default:
            return true;
        }
      });
    }

    return orders;
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action setSection(section) { this.activeSection = section; }

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
    this.formVendorId = '';
    this.formStatus = 'PENDING';
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
    this.formVendorId = wo.vendorId ?? '';
    this.formStatus = wo.status || 'PENDING';
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
      ...(this.formReportedBy ? { reportedBy: this.formReportedBy } : {}),
      ...(this.formVendorId ? { vendorId: this.formVendorId } : {}),
    };

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
