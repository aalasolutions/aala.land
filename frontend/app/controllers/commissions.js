import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { FILTER_STATUS_OPTIONS } from 'land/constants';

export default class CommissionsController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit', 'filterStatus'];
  @tracked filterStatus = '';
  @tracked showModal = false;
  @tracked showCancelModal = false;
  @tracked commissionToCancel = null;
  @tracked cancelReason = '';
  @tracked isCancelling = false;
  @tracked reasonError = '';

  filterStatusOptions = FILTER_STATUS_OPTIONS;

  columns = [
    { name: 'Agent', valuePath: 'agentId', width: 200, isFixed: 'left' },
    { name: 'Deal ID', valuePath: 'leadId', width: 180 },
    { name: 'Type', valuePath: 'type', width: 140 },
    {
      name: 'Amount',
      valuePath: 'commissionAmount',
      width: 220,
      numeric: true,
    },
    { name: 'Rate', valuePath: 'commissionRate', width: 120, numeric: true },
    { name: 'Status', valuePath: 'status', width: 140 },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 100,
      isSortable: false,
      isResizable: false,
    },
  ];

  // The agents list holds active assignable users only; anyone else falls back to the id.
  @action agentName(agentId) {
    return (this.model.agents || []).find((agent) => agent.id === agentId)
      ?.name;
  }

  get filteredCommissions() {
    return this.model?.commissions || [];
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  // Woven::Input/Select/Textarea call onInput/onChange as (value, event),
  // not the raw DOM event setField expects.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  @action setStatusFilter(value) {
    this.filterStatus = value;
    this.page = 1;
  }

  @action openCreate() {
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action refresh() {
    this.router.refresh('commissions');
  }

  @action async approveCommission(commission) {
    try {
      await this.auth.fetchJson(`/commissions/${commission.id}/approve`, {
        method: 'POST',
      });
      this.notifications.success('Commission approved');
      this.router.refresh('commissions');
    } catch (e) {
      this.notifications.error(e.message || 'Failed to approve');
    }
  }

  @action async payCommission(commission) {
    try {
      await this.auth.fetchJson(`/commissions/${commission.id}/pay`, {
        method: 'POST',
      });
      this.notifications.success('Commission marked as paid');
      this.router.refresh('commissions');
    } catch (e) {
      this.notifications.error(e.message || 'Failed to mark as paid');
    }
  }

  @action openCancel(commission) {
    this.commissionToCancel = commission;
    this.cancelReason = '';
    this.reasonError = '';
    this.showCancelModal = true;
  }

  @action closeCancelModal() {
    this.showCancelModal = false;
    this.commissionToCancel = null;
  }

  @action async confirmCancel() {
    if (!this.commissionToCancel || this.isCancelling) return;
    const reason = this.cancelReason.trim();
    if (!reason) {
      this.reasonError = 'Enter a reason';
      return;
    }

    this.isCancelling = true;
    try {
      await this.auth.fetchJson(`/commissions/${this.commissionToCancel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED', reason }),
      });
      this.notifications.success('Commission cancelled');
      this.closeCancelModal();
      this.router.refresh('commissions');
    } catch (e) {
      this.notifications.error(e.message || 'Failed to cancel commission');
    } finally {
      this.isCancelling = false;
    }
  }
}
