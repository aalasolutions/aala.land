import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  contactFormToBody,
  contactToFormFields,
} from '../../utils/contact-form';

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

  resetEditState() {
    this.isEditing = false;
    this.errorMsg = '';
    this.isSaving = false;
    this.expandedLeadId = null;
    this.leadActivities = {};
    this.loadingActivitiesFor = null;
  }

  @action goBack() {
    this.router.transitionTo('contacts.index');
  }

  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  @action startEdit() {
    Object.assign(this, contactToFormFields(this.model.contact));
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

    const body = contactFormToBody(this);

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
