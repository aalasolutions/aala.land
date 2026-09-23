import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  MAX_BACKDATE_DAYS,
  TRANSACTION_TYPE_OPTIONS,
  TRANSACTION_CATEGORY_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  TRANSACTION_STATUS_OPTIONS,
} from 'land/constants';
import {
  DEFAULT_RANGE,
  addCalendarDays,
  formatCalendarDate,
  isDateOnly,
  resolveRange,
  toDateOnly,
  todayInZone,
} from 'land/utils/local-date';

// An incoming cheque is recorded in Cheques Received, so a cheque here is money paid out.
const CHEQUE_IS_ALWAYS = 'EXPENSE';

// Categories whose own label already states the direction.
const CATEGORY_PINNED_TYPE = { RENT: 'INCOME', SALE: 'INCOME' };

// Derived from the map above so the two can never drift apart.
const INCOMING_ONLY_CATEGORIES = Object.keys(CATEGORY_PINNED_TYPE).filter(
  (key) => CATEGORY_PINNED_TYPE[key] === 'INCOME',
);

export default class FinancialsController extends PaginatedController {
  @service auth;
  @service notifications;
  @service region;
  @service router;
  queryParams = ['page', 'limit', 'activeTab', 'range', 'from', 'to'];
  @tracked range = DEFAULT_RANGE;
  @tracked from = null;
  @tracked to = null;
  @tracked rangeError = '';
  @tracked showModal = false;
  @tracked editTransaction = null;
  @tracked formType = 'INCOME';
  @tracked formCategory = 'OTHER';
  @tracked formAmount = '';
  @tracked formDescription = '';
  @tracked formDate = '';
  @tracked formStatus = 'PENDING';
  @tracked formPaymentMethod = 'CASH';
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked activeTab = 'all';

  transactionTypeOptions = TRANSACTION_TYPE_OPTIONS;

  paymentMethodOptions = PAYMENT_METHOD_OPTIONS;

  statusOptions = TRANSACTION_STATUS_OPTIONS;

  get filteredTransactions() {
    return this.model?.transactions ?? [];
  }

  getRowClass = (row) =>
    row?.status === 'CANCELLED' || row?.status === 'FAILED' ? 'is-muted' : '';

  columns = [
    {
      name: 'Description',
      valuePath: 'description',
      width: 260,
      isFixed: 'left',
    },
    { name: 'Category', valuePath: 'category', width: 160 },
    { name: 'Payment', valuePath: 'paymentMethod', width: 160 },
    { name: 'Amount', valuePath: 'amount', width: 140, numeric: true },
    { name: 'Status', valuePath: 'status', width: 140 },
    { name: 'Date', valuePath: 'transactionDate', width: 140, numeric: true },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 110,
      isFixed: 'right',
      isSortable: false,
      isResizable: false,
    },
  ];

  transactionTabs = [
    { id: 'all', label: 'All' },
    { id: 'INCOME', label: 'Income' },
    { id: 'EXPENSE', label: 'Expenses' },
  ];

  // A cheque here is one that was paid out, so incoming-only categories are not offered.
  get categoryOptions() {
    if (this.formPaymentMethod !== 'CHEQUE')
      return TRANSACTION_CATEGORY_OPTIONS;
    return TRANSACTION_CATEGORY_OPTIONS.filter(
      (option) => !INCOMING_ONLY_CATEGORIES.includes(option.value),
    );
  }

  // Payment method outranks category: a cheque typed here is always an expense.
  get lockedType() {
    if (this.formPaymentMethod === 'CHEQUE') return CHEQUE_IS_ALWAYS;
    return CATEGORY_PINNED_TYPE[this.formCategory] ?? null;
  }

  get typeLocked() {
    return this.lockedType !== null;
  }

  get dateLabel() {
    return this.formType === 'EXPENSE'
      ? 'Date money was paid'
      : 'Date money arrived';
  }

  // What the user had chosen before a lock overrode it, so unlocking gives it back
  // instead of stranding them on the locked value.
  typeBeforeLock = null;

  // The selector stays visible and readonly, so the model must carry the locked value too.
  applyTypeLock() {
    const locked = this.lockedType;
    if (locked) {
      if (this.typeBeforeLock === null) this.typeBeforeLock = this.formType;
      this.formType = locked;
      return;
    }
    if (this.typeBeforeLock !== null) {
      this.formType = this.typeBeforeLock;
      this.typeBeforeLock = null;
    }
  }

  @action setCategory(value) {
    this.formCategory = value;
    this.applyTypeLock();
  }

  @action setPaymentMethod(value) {
    this.formPaymentMethod = value;
    // A category the new method no longer offers is cleared, so the choice is re-made rather
    // than silently swapped to one the user never picked.
    if (!this.categoryOptions.some((o) => o.value === this.formCategory)) {
      this.formCategory = '';
    }
    this.applyTypeLock();
  }

  @action setTab(tab) {
    this.activeTab = tab;
    this.page = 1;
  }

  // Re-runs the model hook so a failed load retries with the filters already in the URL.
  @action retryLoad() {
    this.router.refresh('financials');
  }

  get cashflow() {
    return this.model?.cashflow ?? [];
  }

  series(valueOf) {
    return this.cashflow.map((point) => ({
      month: point.month,
      from: point.from,
      to: point.to,
      value: valueOf(point),
    }));
  }

  get incomePoints() {
    return this.series((point) => Number(point.income) || 0);
  }

  get expensePoints() {
    return this.series((point) => Number(point.expense) || 0);
  }

  get netPoints() {
    return this.series(
      (point) => (Number(point.income) || 0) - (Number(point.expense) || 0),
    );
  }

  // The API buckets by calendar month only when the selected range is one; a month point says so.
  get bucketNoun() {
    return this.cashflow[0]?.month ? 'month' : 'period';
  }

  rangeOptions = [
    { id: 'last7', label: 'Last 7 days' },
    { id: 'last30', label: 'Last 30 days' },
    { id: 'thisMonth', label: 'This month' },
    { id: 'lastMonth', label: 'Last month' },
    { id: 'custom', label: 'Custom' },
  ];

  get isCustomRange() {
    return this.range === 'custom';
  }

  // The bounds the API was queried with, so the label matches the data on screen.
  get bounds() {
    // The fallback pivots on the region business day, matching how the route queried.
    return (
      this.model?.bounds ??
      resolveRange(
        this.range,
        this.from,
        this.to,
        new Date(),
        this.region.activeRegion?.timezone,
      )
    );
  }

  // What the stat cards say they are counting.
  get rangeLabel() {
    if (this.range === 'thisMonth' || this.range === 'lastMonth') {
      return this.dayLabel(this.bounds.from, {
        month: 'long',
        year: 'numeric',
      });
    }
    const preset = this.rangeOptions.find((o) => o.id === this.range);
    if (this.range !== 'custom') return preset?.label ?? '';
    return `${this.dayLabel(this.bounds.from)} to ${this.dayLabel(this.bounds.to)}`;
  }

  dayLabel(
    date,
    options = { day: 'numeric', month: 'short', year: 'numeric' },
  ) {
    return (
      formatCalendarDate(date, navigator.language || 'en', options) ?? date
    );
  }

  // Custom seeds from the period on screen; a preset clears the custom window.
  @action setRange(range) {
    const seed = range === 'custom' ? this.bounds : null;
    this.from = seed?.from ?? null;
    this.to = seed?.to ?? null;
    this.rangeError = '';
    this.range = range;
    this.page = 1;
  }

  // The server rejects a half-supplied range but silently swaps a reversed one, so both revert here.
  @action setRangeBound(field, value, event) {
    const current = field === 'from' ? this.from : this.to;
    const revert = () => {
      if (event?.target) {
        event.target.value = current ?? '';
      }
    };

    if (!isDateOnly(value)) {
      this.rangeError = 'Enter a complete date for both ends of the range.';
      revert();
      return;
    }

    const from = field === 'from' ? value : this.from;
    const to = field === 'from' ? this.to : value;
    if (isDateOnly(from) && isDateOnly(to) && from > to) {
      this.rangeError = 'Start date must be on or before the end date.';
      revert();
      return;
    }

    this.rangeError = '';
    this[field] = value;
    this.page = 1;
  }

  // Money cannot arrive in the future, and a month already closed cannot be reopened.
  get dateWindow() {
    const today = todayInZone(this.region.activeRegion?.timezone);
    return {
      earliest: addCalendarDays(today, -MAX_BACKDATE_DAYS),
      latest: today,
    };
  }

  get dateRequired() {
    return this.formStatus === 'COMPLETED';
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  // Nuvo inputs call onInput/onChange as (value, event), not the raw DOM event setField expects.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  @action openCreate() {
    this.formType = 'INCOME';
    this.formCategory = 'OTHER';
    this.formAmount = '';
    this.formDescription = '';
    this.formDate = todayInZone(this.region.activeRegion?.timezone);
    this.formStatus = 'PENDING';
    this.formPaymentMethod = 'CASH';
    this.typeBeforeLock = null;
    this.applyTypeLock();
    this.editTransaction = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(tx) {
    this.formType = tx.type;
    this.formCategory = tx.category ?? 'OTHER';
    this.formAmount = String(tx.amount);
    this.formDescription = tx.description ?? '';
    this.formDate = toDateOnly(tx.transactionDate);
    this.formStatus = tx.status;
    this.formPaymentMethod = tx.paymentMethod ?? 'CASH';
    this.typeBeforeLock = null;
    this.applyTypeLock();
    this.editTransaction = tx;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
    this.editTransaction = null;
    this.errorMsg = '';
  }

  @action async saveTx(event) {
    event.preventDefault();
    if (this.dateRequired && !this.formDate) {
      this.errorMsg =
        this.formType === 'EXPENSE'
          ? 'Enter the date the money was paid.'
          : 'Enter the date the money arrived.';
      return;
    }
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
          paymentMethod: this.formPaymentMethod,
          ...(this.formDescription
            ? { description: this.formDescription }
            : {}),
          ...(this.formDate ? { transactionDate: this.formDate } : {}),
        }
      : {
          type: this.formType,
          category: this.formCategory,
          amount: parseFloat(this.formAmount),
          status: this.formStatus,
          paymentMethod: this.formPaymentMethod,
          ...(this.formDescription
            ? { description: this.formDescription }
            : {}),
          ...(this.formDate ? { transactionDate: this.formDate } : {}),
        };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(
        isEdit ? 'Transaction updated' : 'Transaction created',
      );
      this.closeModal();
      this.router.refresh('financials');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
