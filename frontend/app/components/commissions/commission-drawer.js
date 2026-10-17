import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { COMMISSION_TYPE_OPTIONS } from 'land/constants';

function emptyForm() {
  return {
    agentId: '',
    type: 'SALE',
    grossAmount: '',
    commissionRate: '',
    leadId: '',
    transactionId: '',
    notes: '',
  };
}

// Create only; @agents comes from the page, which also uses it for agent names.
export default class CommissionsCommissionDrawerComponent extends Component {
  @service auth;
  @service notifications;

  @tracked draft = null;
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked fieldErrors = {};

  commissionTypeOptions = COMMISSION_TYPE_OPTIONS;

  get form() {
    return this.draft ?? emptyForm();
  }

  get agentOptions() {
    return (this.args.agents || []).map((agent) => ({
      value: agent.id,
      label: agent.name,
    }));
  }

  @action setField(name, value) {
    this.draft = { ...this.form, [name]: value };
    if (name in this.fieldErrors) {
      const errors = { ...this.fieldErrors };
      delete errors[name];
      this.fieldErrors = errors;
    }
  }

  validate(form) {
    const fields = {};
    if (!form.agentId) fields.agentId = 'Choose an agent';
    if (!form.type) fields.type = 'Choose a type';
    if (!form.grossAmount) fields.grossAmount = 'Enter a gross amount';
    if (!form.commissionRate) fields.commissionRate = 'Enter a commission rate';
    return fields;
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.errorMsg = '';
    this.fieldErrors = {};
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;
    const form = this.form;
    const fields = this.validate(form);
    if (Object.keys(fields).length > 0) {
      this.fieldErrors = fields;
      this.errorMsg = '';
      return;
    }
    this.isSaving = true;
    this.errorMsg = '';
    this.fieldErrors = {};
    try {
      const body = {
        agentId: form.agentId,
        type: form.type,
        grossAmount: parseFloat(form.grossAmount),
        commissionRate: parseFloat(form.commissionRate),
      };
      if (form.leadId) body.leadId = form.leadId;
      if (form.transactionId) body.transactionId = form.transactionId;
      if (form.notes) body.notes = form.notes;

      await this.auth.fetchJson('/commissions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success('Commission created');
      this.close();
      this.args.onSaved?.();
    } catch (e) {
      this.errorMsg = e.message || 'Failed to create commission';
    } finally {
      this.isSaving = false;
    }
  }
}
