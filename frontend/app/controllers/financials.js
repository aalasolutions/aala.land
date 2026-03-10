import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class FinancialsController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked showModal = false;
  @tracked editTransaction = null;
  @tracked formType = 'INCOME';
  @tracked formCategory = 'OTHER';
  @tracked formAmount = '';
  @tracked formDescription = '';
  @tracked formDate = '';
  @tracked formStatus = 'PENDING';
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked activeTab = 'all';

  get filteredTransactions() {
    const transactions = this.model?.transactions ?? [];
    if (this.activeTab === 'all') return transactions;
    return transactions.filter((tx) => tx.type === this.activeTab);
  }

  @action setTab(tab) {
    this.activeTab = tab;
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action openCreate() {
    this.formType = 'INCOME';
    this.formCategory = 'OTHER';
    this.formAmount = '';
    this.formDescription = '';
    this.formDate = new Date().toISOString().split('T')[0];
    this.formStatus = 'PENDING';
    this.editTransaction = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(tx) {
    this.formType = tx.type;
    this.formCategory = tx.category ?? 'OTHER';
    this.formAmount = String(tx.amount);
    this.formDescription = tx.description ?? '';
    this.formDate = tx.transactionDate ? tx.transactionDate.split('T')[0] : '';
    this.formStatus = tx.status;
    this.editTransaction = tx;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editTransaction = null;
    this.errorMsg = '';
  }

  @action async saveTx(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editTransaction;
    const path = isEdit
      ? `/financial/transactions/${this.editTransaction.id}`
      : '/financial/transactions';

    const body = isEdit
      ? {
          amount: parseFloat(this.formAmount),
          status: this.formStatus,
          ...(this.formDescription ? { description: this.formDescription } : {}),
        }
      : {
          type: this.formType,
          category: this.formCategory,
          amount: parseFloat(this.formAmount),
          status: this.formStatus,
          ...(this.formDescription ? { description: this.formDescription } : {}),
          ...(this.formDate ? { transactionDate: this.formDate } : {}),
        };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Transaction updated' : 'Transaction created');
      this.closeModal();
      this.router.refresh('financials');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
