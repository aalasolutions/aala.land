import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const CONTACT_TYPES = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'TENANT', label: 'Tenant' },
  { value: 'OWNER', label: 'Owner' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'OTHER', label: 'Other' },
];

export default class ContactsController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit', 'search'];
  @tracked page = 1;
  @tracked limit = 20;
  @tracked search = '';

  @tracked showModal = false;
  @tracked editContact = null;
  @tracked formFirstName = '';
  @tracked formLastName = '';
  @tracked formEmail = '';
  @tracked formPhone = '';
  @tracked formWhatsappNumber = '';
  @tracked formType = 'OTHER';
  @tracked formContactCompany = '';
  @tracked formJobTitle = '';
  @tracked formAddress = '';
  @tracked formNotes = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';

  get contactTypes() {
    return CONTACT_TYPES;
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action updateSearch(e) {
    this.search = e.target.value;
    this.page = 1;
  }

  @action openCreate() {
    this.formFirstName = '';
    this.formLastName = '';
    this.formEmail = '';
    this.formPhone = '';
    this.formWhatsappNumber = '';
    this.formType = 'OTHER';
    this.formContactCompany = '';
    this.formJobTitle = '';
    this.formAddress = '';
    this.formNotes = '';
    this.editContact = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(contact) {
    this.formFirstName = contact.firstName ?? '';
    this.formLastName = contact.lastName ?? '';
    this.formEmail = contact.email ?? '';
    this.formPhone = contact.phone ?? '';
    this.formWhatsappNumber = contact.whatsappNumber ?? '';
    this.formType = contact.type ?? 'OTHER';
    this.formContactCompany = contact.contactCompany ?? '';
    this.formJobTitle = contact.jobTitle ?? '';
    this.formAddress = contact.address ?? '';
    this.formNotes = contact.notes ?? '';
    this.editContact = contact;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editContact = null;
    this.errorMsg = '';
  }

  @action async saveContact(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editContact;
    const path = isEdit ? `/contacts/${this.editContact.id}` : '/contacts';

    const body = {
      firstName: this.formFirstName,
      ...(this.formLastName ? { lastName: this.formLastName } : {}),
      ...(this.formEmail ? { email: this.formEmail } : {}),
      ...(this.formPhone ? { phone: this.formPhone } : {}),
      ...(this.formWhatsappNumber ? { whatsappNumber: this.formWhatsappNumber } : {}),
      type: this.formType,
      ...(this.formContactCompany ? { contactCompany: this.formContactCompany } : {}),
      ...(this.formJobTitle ? { jobTitle: this.formJobTitle } : {}),
      ...(this.formAddress ? { address: this.formAddress } : {}),
      ...(this.formNotes ? { notes: this.formNotes } : {}),
    };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Contact updated' : 'Contact created');
      this.closeModal();
      this.router.refresh('contacts');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  @action async deleteContact(contact) {
    if (!confirm(`Delete ${contact.firstName} ${contact.lastName || ''}?`)) return;

    try {
      await this.auth.fetchJson(`/contacts/${contact.id}`, { method: 'DELETE' });
      this.notifications.success('Contact deleted');
      this.router.refresh('contacts');
    } catch (e) {
      this.notifications.error(e.message);
    }
  }
}
