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
import { addCalendarDays, toDateOnly, todayInZone } from '../utils/local-date';
import { formatDate } from '../helpers/format-date';
import {
  CHEQUE_TYPE_OPTIONS,
  EMPTY_UNIT_OPTION,
  MAX_BACKDATE_DAYS,
} from 'land/constants';

export default class ChequesController extends PaginatedController {
  @service auth;
  @service notifications;
  @service region;
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

  columns = [
    {
      name: 'Cheque #',
      valuePath: 'chequeNumber',
      width: 160,
      isFixed: 'left',
    },
    { name: 'Unit', valuePath: 'unit.unitNumber', width: 140 },
    { name: 'Bank', valuePath: 'bankName', width: 180 },
    { name: 'Account Holder', valuePath: 'accountHolder', width: 200 },
    { name: 'Amount', valuePath: 'amount', width: 140 },
    { name: 'Due Date', valuePath: 'dueDate', width: 140 },
    { name: 'Type', valuePath: 'type', width: 140 },
    { name: 'Status', valuePath: 'status', width: 140 },
    {
      name: 'Actions',
      valuePath: 'id',
      // Sized for the icon action row, whose widest status renders six buttons.
      width: 260,
      isFixed: 'right',
      isSortable: false,
    },
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

  @tracked showClearModal = false;
  @tracked clearChequeItem = null;
  @tracked clearedDate = '';
  @tracked clearDepositDate = '';
  @tracked clearError = '';
  @tracked isClearing = false;

  @tracked showUnclearModal = false;
  @tracked unclearChequeItem = null;
  @tracked unclearReason = '';
  @tracked isUnclearing = false;

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

  // Nuvo inputs call onInput/onChange as (value, event), not the raw DOM event setField expects.
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
    this.formDueDate = toDateOnly(cheque.dueDate);
    this.formType = cheque.type ?? 'RENT';
    this.formLeaseId = cheque.leaseId ?? '';
    this.formUnitId = cheque.unitId ?? '';
    this.editCheque = cheque;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
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

  // Mirrors the server window, resolved in the cheque's own region, not the viewed
  // one: the 30-day limit from transaction-date-window.util.ts and the due and
  // deposit date floors from cheque-transaction.util.ts. The server decides.
  get clearDateWindow() {
    const cheque = this.clearChequeItem;
    const zone =
      this.region.regions?.find((r) => r.code === cheque?.regionCode)
        ?.timezone ?? this.region.activeRegion?.timezone;
    const today = todayInZone(zone);
    const floors = [
      today && addCalendarDays(today, -MAX_BACKDATE_DAYS),
      toDateOnly(cheque?.dueDate),
      // Only a stored deposit date floors this; a typed one gets pulled, see setClearedDate.
      toDateOnly(cheque?.depositDate),
    ].filter(Boolean);
    return { earliest: floors.sort().at(-1) ?? null, latest: today ?? null };
  }

  // A cheque not yet due has no clearable day: its floor sits past today.
  get clearWindowUnusable() {
    const { earliest, latest } = this.clearDateWindow;
    return !earliest || !latest || earliest > latest;
  }

  get clearBlockedMessage() {
    const dueDate = toDateOnly(this.clearChequeItem?.dueDate);
    const { latest } = this.clearDateWindow;
    if (dueDate && latest && dueDate > latest) {
      return `This cheque is not due until ${formatDate(dueDate)}, so it cannot be cleared yet.`;
    }
    return 'This cheque has no date that can be recorded as its clearing day.';
  }

  // Read-only context: the UTC day the record was added, used as the deposit date floor.
  get chequeAddedDate() {
    return toDateOnly(this.clearChequeItem?.createdAt);
  }

  // Settled once the cheque was marked DEPOSITED; only a PENDING clear may set it.
  get depositDateEditable() {
    return Boolean(this.clearChequeItem) && !this.clearChequeItem.depositDate;
  }

  get depositDateReadonly() {
    return !this.depositDateEditable;
  }

  get depositDateWindow() {
    return { earliest: this.chequeAddedDate || null, latest: this.clearedDate };
  }

  @action openClear(cheque) {
    this.clearChequeItem = cheque;
    this.clearError = '';
    this.showClearModal = true;
    this.clearedDate = this.clearWindowUnusable
      ? ''
      : this.clearDateWindow.latest;
    this.clearDepositDate = toDateOnly(cheque?.depositDate);
  }

  // Moving the clearing day back drags the deposit with it, and that correction sticks.
  @action setClearedDate(value) {
    this.clearedDate = value;
    if (
      this.depositDateEditable &&
      this.clearDepositDate &&
      value &&
      this.clearDepositDate > value
    ) {
      this.clearDepositDate = value;
    }
  }

  @action closeClearModal() {
    this.showClearModal = false;
    this.clearChequeItem = null;
    this.clearedDate = '';
    this.clearDepositDate = '';
    this.clearError = '';
  }

  @action async confirmClear() {
    if (!this.clearChequeItem || this.isClearing) return;
    if (this.clearWindowUnusable) {
      this.clearError = this.clearBlockedMessage;
      return;
    }
    const { earliest, latest } = this.clearDateWindow;
    if (!this.clearedDate) {
      this.clearError = 'The date the cheque cleared is required.';
      return;
    }
    if (this.clearedDate < earliest || this.clearedDate > latest) {
      this.clearError = `Pick a date between ${formatDate(earliest)} and ${formatDate(latest)}.`;
      return;
    }
    // Optional, and range-checked here as well as on the server.
    const depositDate = this.depositDateEditable ? this.clearDepositDate : '';
    if (depositDate) {
      const { earliest: depositFloor } = this.depositDateWindow;
      if (depositFloor && depositDate < depositFloor) {
        this.clearError = `The deposit date cannot be before the cheque was added on ${formatDate(depositFloor)}.`;
        return;
      }
      if (depositDate > this.clearedDate) {
        this.clearError = 'The deposit date cannot be after the clearing date.';
        return;
      }
    }

    this.isClearing = true;
    try {
      await this.auth.fetchJson(`/cheques/${this.clearChequeItem.id}/clear`, {
        method: 'POST',
        body: JSON.stringify({
          clearedDate: this.clearedDate,
          ...(depositDate ? { depositDate } : {}),
        }),
      });
      this.notifications.success('Cheque cleared and payment recorded');
      this.closeClearModal();
      this.router.refresh('cheques');
    } catch (e) {
      this.clearError = e.message || 'Failed to clear cheque';
    } finally {
      this.isClearing = false;
    }
  }

  @action openUnclear(cheque) {
    this.unclearChequeItem = cheque;
    this.unclearReason = '';
    this.reasonError = '';
    this.showUnclearModal = true;
  }

  @action closeUnclearModal() {
    this.showUnclearModal = false;
    this.unclearChequeItem = null;
    this.unclearReason = '';
    this.reasonError = '';
  }

  @action async confirmUnclear() {
    if (!this.unclearChequeItem || this.isUnclearing) return;
    const reason = this.unclearReason.trim();
    if (!reason) {
      this.reasonError = 'Reason is required.';
      return;
    }

    this.isUnclearing = true;
    try {
      await this.auth.fetchJson(
        `/cheques/${this.unclearChequeItem.id}/unclear`,
        { method: 'POST', body: JSON.stringify({ reason }) },
      );
      this.notifications.success('Cheque clearing reversed');
      this.closeUnclearModal();
      this.router.refresh('cheques');
    } catch (e) {
      this.notifications.error(e.message || 'Failed to reverse the clearing');
    } finally {
      this.isUnclearing = false;
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
    this.reasonError = '';
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
