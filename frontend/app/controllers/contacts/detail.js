import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class ContactsDetailController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked isEditing = false;
  @tracked formFirstName = '';
  @tracked formLastName = '';
  @tracked formEmail = '';
  @tracked formPhone = '';
  @tracked formIsWhatsapp = false;
  @tracked formNationality = '';
  @tracked formNationalId = '';
  @tracked formContactCompany = '';
  @tracked formJobTitle = '';
  @tracked formAddress = '';
  @tracked formNotes = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';

  @tracked expandedLeadId = null;
  @tracked leadActivities = {};
  @tracked loadingActivitiesFor = null;

  @action goBack() {
    this.router.transitionTo('contacts.index');
  }

  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  @action toggleIsWhatsapp(e) {
    this.formIsWhatsapp = e.target.checked;
  }

  @action startEdit() {
    const contact = this.model.contact;
    this.formFirstName = contact?.firstName ?? '';
    this.formLastName = contact?.lastName ?? '';
    this.formEmail = contact?.email ?? '';
    this.formPhone = contact?.phone ?? '';
    this.formIsWhatsapp = !!contact?.isWhatsapp;
    this.formNationality = contact?.nationality ?? '';
    this.formNationalId = contact?.nationalId ?? '';
    this.formContactCompany = contact?.contactCompany ?? '';
    this.formJobTitle = contact?.jobTitle ?? '';
    this.formAddress = contact?.address ?? '';
    this.formNotes = contact?.notes ?? '';
    this.errorMsg = '';
    this.isEditing = true;
  }

  @action cancelEdit() {
    this.isEditing = false;
    this.errorMsg = '';
  }

  @action async saveContact(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const body = {
      ...(this.formFirstName ? { firstName: this.formFirstName } : {}),
      ...(this.formLastName ? { lastName: this.formLastName } : {}),
      ...(this.formEmail ? { email: this.formEmail } : {}),
      ...(this.formPhone ? { phone: this.formPhone } : {}),
      isWhatsapp: this.formIsWhatsapp,
      ...(this.formNationality
        ? { nationality: this.formNationality }
        : {}),
      ...(this.formNationalId ? { nationalId: this.formNationalId } : {}),
      ...(this.formContactCompany
        ? { contactCompany: this.formContactCompany }
        : {}),
      ...(this.formJobTitle ? { jobTitle: this.formJobTitle } : {}),
      ...(this.formAddress ? { address: this.formAddress } : {}),
      ...(this.formNotes ? { notes: this.formNotes } : {}),
    };

    try {
      await this.auth.fetchJson(`/contacts/${this.model.contact.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      this.notifications.success('Contact updated');
      this.isEditing = false;
      this.router.refresh('contacts.detail');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  @action async toggleLeadActivity(leadId) {
    if (this.expandedLeadId === leadId) {
      this.expandedLeadId = null;
      return;
    }
    this.expandedLeadId = leadId;
    if (this.leadActivities[leadId]) return;

    this.loadingActivitiesFor = leadId;
    try {
      const data = await this.auth.fetchJson(`/leads/${leadId}/activities`);
      this.leadActivities = { ...this.leadActivities, [leadId]: data.data || [] };
    } catch (e) {
      console.error('Failed to load lead activities:', e);
      this.leadActivities = { ...this.leadActivities, [leadId]: [] };
    } finally {
      this.loadingActivitiesFor = null;
    }
  }
}
