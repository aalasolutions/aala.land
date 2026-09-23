import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  contactFormToBody,
  contactToFormFields,
} from '../../utils/contact-form';
import { ROLES } from '../../utils/roles';

const HISTORY_ROLES = [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER];

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

  unitColumns = [
    { name: 'Unit', valuePath: 'unitNumber', width: 200, isFixed: 'left' },
    { name: 'Area', valuePath: 'areaName', width: 200 },
    { name: 'Type', valuePath: 'propertyType', width: 160 },
    { name: 'Status', valuePath: 'status', width: 140 },
    { name: 'Price', valuePath: 'price', width: 140 },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 120,
      isFixed: 'right',
      isSortable: false,
      isResizable: false,
    },
  ];

  leaseColumns = [
    {
      name: 'Unit',
      valuePath: 'unit.unitNumber',
      width: 200,
      isFixed: 'left',
    },
    { name: 'Status', valuePath: 'status', width: 160 },
    { name: 'Start', valuePath: 'startDate', width: 140 },
    { name: 'End', valuePath: 'endDate', width: 140 },
    { name: 'Rent', valuePath: 'monthlyRent', width: 140 },
  ];

  resetEditState() {
    this.isEditing = false;
    this.errorMsg = '';
    this.isSaving = false;
    this.expandedLeadId = null;
    this.leadActivities = {};
    this.loadingActivitiesFor = null;
  }

  // Same roles as GET /record-history.
  get canViewHistory() {
    return HISTORY_ROLES.includes(this.auth.currentUser?.role);
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
