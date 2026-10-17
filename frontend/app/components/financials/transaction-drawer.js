import Component from '@glimmer/component';
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
  addCalendarDays,
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

// A cheque here is one that was paid out, so incoming-only categories are not offered.
function categoryOptionsFor(paymentMethod) {
  if (paymentMethod !== 'CHEQUE') return TRANSACTION_CATEGORY_OPTIONS;
  return TRANSACTION_CATEGORY_OPTIONS.filter(
    (option) => !INCOMING_ONLY_CATEGORIES.includes(option.value),
  );
}

// Payment method outranks category: a cheque typed here is always an expense.
function lockedTypeFor(form) {
  if (form.paymentMethod === 'CHEQUE') return CHEQUE_IS_ALWAYS;
  return CATEGORY_PINNED_TYPE[form.category] ?? null;
}

// typeBeforeLock remembers the choice a lock overrode, so unlocking gives it back.
function withTypeLock(form) {
  const locked = lockedTypeFor(form);
  if (locked) {
    return {
      ...form,
      typeBeforeLock: form.typeBeforeLock ?? form.type,
      type: locked,
    };
  }
  if (form.typeBeforeLock !== null) {
    return { ...form, type: form.typeBeforeLock, typeBeforeLock: null };
  }
  return form;
}

function amountErrorFor(amount) {
  const text = typeof amount === 'string' ? amount.trim() : amount;
  if (text === '' || text === null || text === undefined) {
    return 'Enter an amount';
  }
  const value = parseFloat(text);
  return Number.isNaN(value) || value <= 0
    ? 'Enter an amount greater than 0'
    : '';
}

function formFrom(tx, today) {
  const form = tx
    ? {
        type: tx.type,
        category: tx.category ?? 'OTHER',
        amount: String(tx.amount),
        description: tx.description ?? '',
        date: toDateOnly(tx.transactionDate),
        status: tx.status,
        paymentMethod: tx.paymentMethod ?? 'CASH',
      }
    : {
        type: 'INCOME',
        category: 'OTHER',
        amount: '',
        description: '',
        date: today,
        status: 'PENDING',
        paymentMethod: 'CASH',
      };
  return withTypeLock({ ...form, typeBeforeLock: null });
}

// No @transaction means create.
export default class FinancialsTransactionDrawerComponent extends Component {
  @service auth;
  @service notifications;
  @service region;

  @tracked draft = null;
  @tracked isSaving = false;
  @tracked error = null;
  @tracked fieldError = null;

  draftFor = null;
  transactionTypeOptions = TRANSACTION_TYPE_OPTIONS;
  paymentMethodOptions = PAYMENT_METHOD_OPTIONS;
  statusOptions = TRANSACTION_STATUS_OPTIONS;

  // Draft and error are keyed to the record they were made for.
  get source() {
    return this.args.transaction?.id ?? 'new';
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return formFrom(
      this.args.transaction,
      todayInZone(this.region.activeRegion?.timezone),
    );
  }

  get isEdit() {
    return Boolean(this.args.transaction);
  }

  get errorMsg() {
    return this.error?.source === this.source ? this.error.message : '';
  }

  set errorMsg(message) {
    this.error = message ? { source: this.source, message } : null;
  }

  get dateError() {
    return this.fieldError?.source === this.source
      ? (this.fieldError.date ?? '')
      : '';
  }

  get amountError() {
    return this.fieldError?.source === this.source
      ? (this.fieldError.amount ?? '')
      : '';
  }

  get categoryError() {
    return this.fieldError?.source === this.source
      ? (this.fieldError.category ?? '')
      : '';
  }

  clearFieldError(key) {
    if (this.fieldError?.[key] === undefined) return;
    const { [key]: removed, ...rest } = this.fieldError; // eslint-disable-line no-unused-vars
    this.fieldError = rest.date || rest.amount || rest.category ? rest : null;
  }

  get submitLabel() {
    if (this.isSaving) return 'Saving...';
    return this.isEdit ? 'Update' : 'Create';
  }

  get categoryOptions() {
    return categoryOptionsFor(this.form.paymentMethod);
  }

  get typeLocked() {
    return lockedTypeFor(this.form) !== null;
  }

  get dateLabel() {
    return this.form.type === 'EXPENSE'
      ? 'Date money was paid'
      : 'Date money arrived';
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
    return this.form.status === 'COMPLETED';
  }

  write(next) {
    this.draftFor = this.source;
    this.draft = next;
  }

  @action setField(name, value) {
    this.write({ ...this.form, [name]: value });
    if (name === 'date' || name === 'status') this.clearFieldError('date');
    if (name === 'amount') this.clearFieldError('amount');
  }

  // The selector stays visible and readonly, so the form must carry the locked value too.
  @action setCategory(value) {
    this.write(withTypeLock({ ...this.form, category: value }));
    this.clearFieldError('category');
  }

  // A category the new method no longer offers is cleared, so the choice is re-made rather
  // than silently swapped to one the user never picked.
  @action setPaymentMethod(value) {
    const next = { ...this.form, paymentMethod: value };
    if (!categoryOptionsFor(value).some((o) => o.value === next.category)) {
      next.category = '';
    }
    this.write(withTypeLock(next));
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.draftFor = null;
    this.error = null;
    this.fieldError = null;
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    const form = this.form;
    const errors = {};
    if (this.dateRequired && !form.date) {
      errors.date =
        form.type === 'EXPENSE'
          ? 'Enter the date the money was paid'
          : 'Enter the date the money arrived';
    }
    if (!form.category) errors.category = 'Choose a category';
    const amountMsg = amountErrorFor(form.amount);
    if (amountMsg) errors.amount = amountMsg;
    if (errors.date || errors.amount || errors.category) {
      this.errorMsg = '';
      this.fieldError = { source: this.source, ...errors };
      return;
    }
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';
    this.fieldError = null;

    const isEdit = this.isEdit;
    const source = this.source;
    const path = isEdit
      ? `/financial/transactions/${this.args.transaction.id}`
      : '/financial/transactions';

    const body = isEdit
      ? {
          amount: parseFloat(form.amount),
          status: form.status,
          paymentMethod: form.paymentMethod,
          ...(form.description ? { description: form.description } : {}),
          ...(form.date ? { transactionDate: form.date } : {}),
        }
      : {
          type: form.type,
          category: form.category,
          amount: parseFloat(form.amount),
          status: form.status,
          paymentMethod: form.paymentMethod,
          ...(form.description ? { description: form.description } : {}),
          ...(form.date ? { transactionDate: form.date } : {}),
        };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(
        isEdit ? 'Transaction updated' : 'Transaction created',
      );
      this.close();
      this.args.onSaved?.();
    } catch (e) {
      this.error = { source, message: e.message };
    } finally {
      this.isSaving = false;
    }
  }
}
