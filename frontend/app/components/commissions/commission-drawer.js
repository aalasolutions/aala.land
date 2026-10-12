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
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.errorMsg = '';
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;
    const form = this.form;
    if (!form.agentId) {
      this.errorMsg = 'Please select an agent';
      return;
    }
    this.isSaving = true;
    this.errorMsg = '';
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
