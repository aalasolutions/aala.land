import PaginatedController from './paginated-base';
import { cached, tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  DEFAULT_RANGE,
  formatCalendarDate,
  isDateOnly,
  resolveRange,
  toDateOnly,
  todayInZone,
} from 'land/utils/local-date';
import { dueStatus } from 'land/utils/due-status';

const QUEUE_LIMIT = 8;

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
  @tracked activeTab = 'all';

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
    { name: 'Date', valuePath: 'transactionDate', width: 140 },
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

  get cashflowFailed() {
    return this.model?.cashflow === null;
  }

  get totals() {
    const summary = this.model?.summary;
    if (!summary) return null;
    return {
      income: summary.totalIncome,
      expense: summary.totalExpense,
      net: summary.net,
    };
  }

  get categoriesFailed() {
    return this.model?.categories === null;
  }

  @cached
  get expenseCategories() {
    const rows = (this.model?.categories ?? [])
      .filter((row) => row.type === 'EXPENSE' && Number(row.total) > 0)
      .map((row) => ({
        category: row.category,
        total: Number(row.total),
      }))
      .sort((a, b) => b.total - a.total);
    const sum = rows.reduce((acc, row) => acc + row.total, 0);
    return rows.map((row) => ({
      ...row,
      share: sum ? Math.round((row.total / sum) * 100) : 0,
    }));
  }

  get queueFailed() {
    return (
      this.model?.chequeSchedule === null ||
      this.model?.depositReminders === null
    );
  }

  @cached
  get queue() {
    return this.queueFor(todayInZone(this.region.activeRegion?.timezone));
  }

  queueFor(today) {
    const schedule = this.model?.chequeSchedule ?? {};
    const reminders = this.model?.depositReminders ?? {};
    const cheque = (row) => ({
      kind: 'cheque',
      key: `cheque-${row.id}`,
      id: row.id,
      title: `Cheque ${row.chequeNumber}`,
      detail: row.bankName,
      holder: row.accountHolder,
      dueDate: toDateOnly(row.dueDate),
      amount: Number(row.amount) || 0,
      currency: row.currency,
    });
    const payment = (row) => ({
      kind: 'payment',
      key: `payment-${row.id}`,
      id: row.id,
      title: row.description || 'Payment due',
      detail: row.category,
      areaId: row.areaId,
      unitId: row.unitId,
      unitNumber: row.unitNumber,
      tenantContactId: row.tenantContactId,
      tenantName: row.tenantName,
      dueDate: toDateOnly(row.dueDate),
      amount: Number(row.amount) || 0,
      currency: row.currency,
    });
    const group = (cheques, payments) =>
      [...(cheques ?? []).map(cheque), ...(payments ?? []).map(payment)]
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((row) => {
          const status = dueStatus(row.dueDate, today);
          return {
            ...row,
            isOverdue: status.isOverdue,
            dueLabel: status.label,
            dueWord: status.word,
          };
        });

    const overdue = group(schedule.overdue, reminders.overdue);
    const thisWeek = group(schedule.thisWeek, [
      ...(reminders.dueToday ?? []),
      ...(reminders.dueThisWeek ?? []),
    ]);
    const all = [...overdue, ...thisWeek];
    return {
      rows: all.slice(0, QUEUE_LIMIT),
      hiddenCount: Math.max(0, all.length - QUEUE_LIMIT),
      count: all.length,
      overdueCount: overdue.length,
      overdueTotal: overdue.reduce((sum, row) => sum + row.amount, 0),
    };
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

  @action openCreate() {
    this.editTransaction = null;
    this.showModal = true;
  }

  @action openEdit(tx) {
    this.editTransaction = tx;
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
    this.editTransaction = null;
  }
}
