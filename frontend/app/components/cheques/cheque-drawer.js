import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { CHEQUE_TYPE_OPTIONS, EMPTY_UNIT_OPTION } from 'land/constants';
import { toDateOnly } from 'land/utils/local-date';
import { safeJson } from 'land/utils/safe-json';

function formFrom(cheque) {
  if (!cheque) {
    return {
      chequeNumber: '',
      bankName: '',
      accountHolder: '',
      amount: '',
      dueDate: '',
      type: 'RENT',
      leaseId: '',
      unitId: '',
    };
  }
  return {
    chequeNumber: cheque.chequeNumber,
    bankName: cheque.bankName,
    accountHolder: cheque.accountHolder,
    amount: String(cheque.amount),
    dueDate: toDateOnly(cheque.dueDate),
    type: cheque.type ?? 'RENT',
    leaseId: cheque.leaseId ?? '',
    unitId: cheque.unitId ?? '',
  };
}

// No @cheque means create.
export default class ChequesChequeDrawerComponent extends Component {
  @service auth;
  @service notifications;

  @tracked draft = null;
  @tracked units = [];
  @tracked isSaving = false;
  @tracked error = null;
  @tracked fieldError = null;

  draftFor = null;
  unitsRequest = 0;
  chequeTypeOptions = CHEQUE_TYPE_OPTIONS;

  // The form mounts on every open, so the list follows the active region.
  loadOnOpen = modifier(() => {
    this.loadUnits();
  });

  async loadUnits() {
    // Leave the render pass; reads after this are not tracked by the modifier.
    await Promise.resolve();
    if (this.isDestroying || this.isDestroyed) return;
    const request = ++this.unitsRequest;
    const json = await safeJson(
      this.auth,
      '/properties/units?page=1&limit=100',
      'CHEQUES',
    );
    if (this.isDestroying || this.isDestroyed) return;
    if (request !== this.unitsRequest) return;
    this.units = json?.data?.data ?? [];
  }

  // Draft and error are keyed to the record they were made for.
  get source() {
    return this.args.cheque?.id ?? 'new';
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return formFrom(this.args.cheque);
  }

  get isEdit() {
    return Boolean(this.args.cheque);
  }

  get errorMsg() {
    return this.error?.source === this.source ? this.error.message : '';
  }

  get fieldErrors() {
    return this.fieldError?.source === this.source
      ? this.fieldError.errors
      : {};
  }

  get unitOptions() {
    return [
      EMPTY_UNIT_OPTION,
      ...this.units.map((unit) => ({
        value: unit.id,
        label: `${unit.areaName} - ${unit.assetName} - Property ${unit.unitNumber}`,
      })),
    ];
  }

  @action setField(name, value) {
    this.draftFor = this.source;
    this.draft = { ...this.form, [name]: value };
    this.dropFieldError(name);
  }

  dropFieldError(name) {
    if (!(name in this.fieldErrors)) return;
    const errors = { ...this.fieldErrors };
    delete errors[name];
    this.fieldError = { source: this.source, errors };
  }

  validate(form) {
    const errors = {};
    if (!form.chequeNumber.trim())
      errors.chequeNumber = 'Enter a cheque number';
    if (!form.bankName.trim()) errors.bankName = 'Enter a bank name';
    if (!form.accountHolder.trim()) {
      errors.accountHolder = 'Enter an account holder';
    }
    if (String(form.amount).trim() === '') errors.amount = 'Enter an amount';
    if (!form.dueDate) errors.dueDate = 'Enter a due date';
    return errors;
  }

  // Native <input type="date"> still emits a raw DOM event.
  @action setFieldFromEvent(name, event) {
    this.setField(name, event.target.value);
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.draftFor = null;
    this.units = [];
    this.error = null;
    this.fieldError = null;
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;

    const form = this.form;
    const errors = this.validate(form);
    if (Object.keys(errors).length > 0) {
      this.error = null;
      this.fieldError = { source: this.source, errors };
      return;
    }

    this.isSaving = true;
    this.error = null;
    this.fieldError = null;
    const isEdit = this.isEdit;
    const source = this.source;
    const path = isEdit ? `/cheques/${this.args.cheque.id}` : '/cheques';

    const body = isEdit
      ? {
          chequeNumber: form.chequeNumber,
          bankName: form.bankName,
          amount: parseFloat(form.amount),
          type: form.type,
          dueDate: form.dueDate,
          ...(form.unitId ? { unitId: form.unitId } : {}),
        }
      : {
          chequeNumber: form.chequeNumber,
          bankName: form.bankName,
          accountHolder: form.accountHolder,
          amount: parseFloat(form.amount),
          dueDate: form.dueDate,
          type: form.type,
          ...(form.leaseId ? { leaseId: form.leaseId } : {}),
          ...(form.unitId ? { unitId: form.unitId } : {}),
        };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Cheque updated' : 'Cheque created');
      this.close();
      this.args.onSaved?.();
    } catch (e) {
      this.error = { source, message: e.message };
    } finally {
      this.isSaving = false;
    }
  }
}
