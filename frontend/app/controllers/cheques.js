import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class ChequesController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked showModal = false;
  @tracked editCheque = null;
  @tracked formChequeNumber = '';
  @tracked formBankName = '';
  @tracked formAccountHolder = '';
  @tracked formAmount = '';
  @tracked formDueDate = '';
  @tracked formType = 'RENT';
  @tracked formLeaseId = '';
  @tracked formUnitId = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action openCreate() {
    this.formChequeNumber = '';
    this.formBankName = '';
    this.formAccountHolder = '';
    this.formAmount = '';
    this.formDueDate = '';
    this.formType = 'RENT';
    this.formLeaseId = '';
    this.formUnitId = '';
    this.editCheque = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(cheque) {
    this.formChequeNumber = cheque.chequeNumber;
    this.formBankName = cheque.bankName;
    this.formAccountHolder = cheque.accountHolder;
    this.formAmount = String(cheque.amount);
    this.formDueDate = cheque.dueDate ? cheque.dueDate.split('T')[0] : '';
    this.formType = cheque.type ?? 'RENT';
    this.formLeaseId = cheque.leaseId ?? '';
    this.formUnitId = cheque.unitId ?? '';
    this.editCheque = cheque;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editCheque = null;
    this.errorMsg = '';
  }

  @action async saveCheque(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editCheque;
    const path = isEdit ? `/cheques/${this.editCheque.id}` : '/cheques';

    const body = isEdit
      ? {
          chequeNumber: this.formChequeNumber,
          bankName: this.formBankName,
          amount: parseFloat(this.formAmount),
          ...(this.formUnitId ? { unitId: this.formUnitId } : {}),
        }
      : {
          chequeNumber: this.formChequeNumber,
          bankName: this.formBankName,
          accountHolder: this.formAccountHolder,
          amount: parseFloat(this.formAmount),
          dueDate: this.formDueDate,
          type: this.formType,
          ...(this.formLeaseId ? { leaseId: this.formLeaseId } : {}),
          ...(this.formUnitId ? { unitId: this.formUnitId } : {}),
        };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Cheque updated' : 'Cheque created');
      this.closeModal();
      this.router.refresh('cheques');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
