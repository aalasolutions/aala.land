import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const FILTER_STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PAID', label: 'Paid' },
];

const COMMISSION_TYPE_OPTIONS = [
  { value: 'SALE', label: 'Sale' },
  { value: 'RENTAL', label: 'Rental' },
  { value: 'REFERRAL', label: 'Referral' },
];

export default class CommissionsController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit', 'filterStatus'];
  @tracked page = 1;
  @tracked limit = 10;
  @tracked filterStatus = '';
  @tracked showModal = false;
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked formAgentId = '';
  @tracked formType = 'SALE';
  @tracked formGrossAmount = '';
  @tracked formCommissionRate = '';
  @tracked formLeadId = '';
  @tracked formTransactionId = '';
  @tracked formNotes = '';

  filterStatusOptions = FILTER_STATUS_OPTIONS;

  commissionTypeOptions = COMMISSION_TYPE_OPTIONS;

  get agentOptions() {
    return (this.model.agents || []).map(agent => ({
      value: agent.id,
      label: agent.name
    }));
  }

  get filteredCommissions() {
    return this.model?.commissions || [];
  }

  get totalPages() {
    const total = this.model?.total ?? 0;
    return Math.max(1, Math.ceil(total / this.limit));
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  @action setStatusFilter(e) {
    this.filterStatus = e.target.value;
    this.page = 1;
  }

  @action setLimit(e) {
    this.limit = Number(e.target.value) || 10;
    this.page = 1;
  }

  @action goToPreviousPage() {
    if (this.page <= 1) return;
    this.page -= 1;
  }

  @action goToNextPage() {
    if (this.page >= this.totalPages) return;
    this.page += 1;
  }

  @action openCreate() {
    this.formAgentId = '';
    this.formType = 'SALE';
    this.formGrossAmount = '';
    this.formCommissionRate = '';
    this.formLeadId = '';
    this.formTransactionId = '';
    this.formNotes = '';
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.errorMsg = '';
  }

  @action async saveCommission(event) {
    event.preventDefault();
    if (!this.formAgentId) {
      this.errorMsg = 'Please select an agent';
      return;
    }
    this.isSaving = true;
    this.errorMsg = '';
    try {
      const body = {
        agentId: this.formAgentId,
        type: this.formType,
        grossAmount: parseFloat(this.formGrossAmount),
        commissionRate: parseFloat(this.formCommissionRate),
      };
      if (this.formLeadId) body.leadId = this.formLeadId;
      if (this.formTransactionId) body.transactionId = this.formTransactionId;
      if (this.formNotes) body.notes = this.formNotes;

      await this.auth.fetchJson('/commissions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success('Commission created');
      this.showModal = false;
      this.router.refresh('commissions');
    } catch (e) {
      this.errorMsg = e.message || 'Failed to create commission';
    } finally {
      this.isSaving = false;
    }
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
}
