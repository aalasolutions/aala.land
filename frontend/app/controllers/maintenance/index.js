import PaginatedController from '../paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { isAdminRole } from '../../utils/roles';
import {
  openDeleteModal,
  closeDeleteModal,
  confirmDeleteModal,
} from '../../utils/delete-modal';
import { MAINTENANCE_STATUS_OPTIONS, MONTH_OPTIONS } from 'land/constants';

export default class MaintenanceController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit', 'filterStatus', 'filterMonth'];

  @tracked filterStatus = '';
  @tracked filterMonth = '';

  @tracked showModal = false;
  @tracked editWorkOrder = null;
  @tracked activeSection = 'orders';
  @tracked showDeleteModal = false;
  @tracked workOrderToDelete = null;
  @tracked deleteReason = '';
  @tracked isDeleting = false;
  @tracked reasonError = '';

  statusOptions = MAINTENANCE_STATUS_OPTIONS;

  columns = [
    { name: 'Title', valuePath: 'title', width: 250, isFixed: 'left' },
    { name: 'Property', valuePath: 'assetName', width: 220 },
    { name: 'Category', valuePath: 'category', width: 140 },
    { name: 'Priority', valuePath: 'priority', width: 120 },
    {
      name: 'Est. Cost',
      valuePath: 'estimatedCost',
      width: 140,
      numeric: true,
    },
    { name: 'Actual Cost', valuePath: 'actualCost', width: 140, numeric: true },
    {
      name: 'Scheduled',
      valuePath: 'scheduledDate',
      width: 140,
      numeric: true,
    },
    { name: 'Status', valuePath: 'status', width: 140 },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 100,
      isFixed: 'right',
      isSortable: false,
      isResizable: false,
    },
  ];

  // Mirrors the backend delete guard.
  @action canDeleteWorkOrder(wo) {
    return (
      isAdminRole(this.auth.currentUser?.role) &&
      wo.status === 'OPEN' &&
      !wo.vendorId &&
      !Number(wo.actualCost)
    );
  }

  get sectionTabs() {
    return [
      { id: 'orders', label: 'Work Orders' },
      { id: 'upcoming', label: 'Upcoming Preventive' },
    ];
  }

  monthOptions = MONTH_OPTIONS;

  get filteredWorkOrders() {
    return this.model?.workOrders || [];
  }

  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;

    if (fieldName === 'deleteReason') {
      this.reasonError = '';
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
    this.editWorkOrder = null;
    this.showModal = true;
  }

  @action openEdit(wo) {
    this.editWorkOrder = wo;
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
    this.editWorkOrder = null;
  }

  @action refresh() {
    this.router.refresh('maintenance');
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
