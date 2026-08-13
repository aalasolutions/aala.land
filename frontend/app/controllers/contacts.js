import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { debounceTask } from 'ember-lifeline';
import {
  closeDeleteModal,
  confirmDeleteModal,
  openDeleteModal,
} from '../utils/delete-modal';

export default class ContactsController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit', 'search'];
  @tracked search = '';

  @tracked showModal = false;
  @tracked editContact = null;
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
  @tracked showDeleteModal = false;
  @tracked contactToDelete = null;
  @tracked isDeleting = false;

  // Nuvo::Input/Select/Textarea call onInput/onChange as (value, event),
  // not the raw DOM event a legacy setField(fieldName, e) expects.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  // Native checkbox: read .checked off the event.
  @action toggleIsWhatsapp(e) {
    this.formIsWhatsapp = e.target.checked;
  }

  @action updateSearch(e) {
    debounceTask(this, 'applySearch', e.target.value, 500);
  }

  applySearch(value) {
    this.search = value;
    this.page = 1;
  }

  @action openCreate() {
    this.formFirstName = '';
    this.formLastName = '';
    this.formEmail = '';
    this.formPhone = '';
    this.formIsWhatsapp = false;
    this.formNationality = '';
    this.formNationalId = '';
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
    this.formIsWhatsapp = !!contact.isWhatsapp;
    this.formNationality = contact.nationality ?? '';
    this.formNationalId = contact.nationalId ?? '';
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
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(
        isEdit ? 'Contact updated' : 'Contact created',
      );
      this.closeModal();
      this.router.refresh('contacts');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  @action openDelete(contact) {
    openDeleteModal(this, 'contactToDelete', contact);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'contactToDelete');
  }

  @action async confirmDelete() {
    await confirmDeleteModal(this, {
      itemKey: 'contactToDelete',
      resourcePath: '/contacts',
      successMessage: 'Contact deleted',
      refreshRoute: 'contacts',
    });
  }
}
