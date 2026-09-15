import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { ROLES, isAdminRole } from '../utils/roles';
import {
  openDeleteModal,
  closeDeleteModal,
  confirmDeleteModal,
} from '../utils/delete-modal';
import { CHEQUE_TYPE_OPTIONS, EMPTY_UNIT_OPTION } from 'land/constants';

export default class ChequesController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;
  @service socket;
  chequeUpdatedHandler = null;
  queryParams = ['page', 'limit'];
  constructor() {
    super(...arguments);
    this.setupSocket();
  }

  setupSocket() {
    this.chequeUpdatedHandler = (data) => {
      // Only refresh if the update was from another user
      if (data.updatedBy !== this.auth.currentUser?.id) {
        if (this.router.isActive('cheques')) {
          this.router.refresh('cheques');
        }
      }
    };
    this.socket.on('chequeUpdated', this.chequeUpdatedHandler);
  }

  willDestroy() {
    if (this.chequeUpdatedHandler) {
      this.socket.off('chequeUpdated', this.chequeUpdatedHandler);
    }

    super.willDestroy(...arguments);
  }

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

  @tracked activeTab = 'cheques';

  tabs = [
    { id: 'cheques', label: 'Cheques', icon: 'list-checks' },
    { id: 'schedule', label: 'Collection Schedule', icon: 'calendar-check' },
  ];
  @tracked showBounceModal = false;
  @tracked bounceChequeItem = null;
  @tracked formBounceReason = '';

  @tracked showCancelModal = false;
  @tracked chequeToCancel = null;
  @tracked cancelReason = '';
  @tracked isCancelling = false;
  @tracked showDeleteModal = false;
  @tracked chequeToDelete = null;
  @tracked deleteReason = '';
  @tracked isDeleting = false;
  @tracked reasonError = '';

  // Matches POST and PATCH /cheques roles; ACCOUNTANT is read-only.
  get canWriteCheques() {
    return [
      ROLES.SUPER_ADMIN,
      ROLES.COMPANY_ADMIN,
      ROLES.ADMIN,
      ROLES.MANAGER,
    ].includes(this.auth.currentUser?.role);
  }

  get canDeleteCheque() {
    return isAdminRole(this.auth.currentUser?.role);
  }

  get chequeTypeOptions() {
    return CHEQUE_TYPE_OPTIONS;
  }

  get unitOptions() {
    return [
      EMPTY_UNIT_OPTION,
      ...(this.model.units || []).map((unit) => ({
        value: unit.id,
        label: `${unit.areaName} - ${unit.assetName} - Property ${unit.unitNumber}`,
      })),
    ];
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  // Nuvo::Input/Select/Textarea call onInput/onChange as (value, event),
  // not the raw DOM event setField expects.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  @action setTab(tab) {
    this.activeTab = tab;
  }

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
          type: this.formType,
          dueDate: this.formDueDate,
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

  @action openBounceModal(cheque) {
    this.bounceChequeItem = cheque;
    this.formBounceReason = '';
    this.showBounceModal = true;
  }

  @action closeBounceModal() {
    this.showBounceModal = false;
    this.bounceChequeItem = null;
    this.formBounceReason = '';
  }

  @action async updateStatus(cheque, status) {
    try {
      await this.auth.fetchJson(`/cheques/${cheque.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      this.notifications.success(`Cheque marked as ${status.toLowerCase()}`);
      this.router.refresh('cheques');
    } catch (e) {
      this.notifications.error(e.message);
    }
  }

  @action openCancel(cheque) {
    this.chequeToCancel = cheque;
    this.cancelReason = '';
    this.reasonError = '';
    this.showCancelModal = true;
  }

  @action closeCancelModal() {
    this.showCancelModal = false;
    this.chequeToCancel = null;
  }

  @action async confirmCancel() {
    if (!this.chequeToCancel || this.isCancelling) return;
    const reason = this.cancelReason.trim();
    if (!reason) {
      this.reasonError = 'Reason is required.';
      return;
    }

    this.isCancelling = true;
    try {
      await this.auth.fetchJson(`/cheques/${this.chequeToCancel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED', reason }),
      });
      this.notifications.success('Cheque cancelled');
      this.closeCancelModal();
      this.router.refresh('cheques');
    } catch (e) {
      this.notifications.error(e.message || 'Failed to cancel cheque');
    } finally {
      this.isCancelling = false;
    }
  }

  @action openDelete(cheque) {
    this.deleteReason = '';
    this.reasonError = '';
    openDeleteModal(this, 'chequeToDelete', cheque);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'chequeToDelete');
  }

  @action async confirmDelete() {
    const reason = this.deleteReason.trim();
    if (!reason) {
      this.reasonError = 'Reason is required.';
      return;
    }
    await confirmDeleteModal(this, {
      itemKey: 'chequeToDelete',
      resourcePath: '/cheques',
      successMessage: 'Cheque deleted',
      refreshRoute: 'cheques',
      body: { reason },
    });
  }

  @action async confirmBounce() {
    if (!this.bounceChequeItem) return;
    try {
      await this.auth.fetchJson(`/cheques/${this.bounceChequeItem.id}/bounce`, {
        method: 'POST',
        body: JSON.stringify({
          bounceReason: this.formBounceReason || undefined,
        }),
      });
      this.notifications.success('Cheque marked as bounced');
      this.closeBounceModal();
      this.router.refresh('cheques');
    } catch (e) {
      this.notifications.error(e.message);
    }
  }
}
