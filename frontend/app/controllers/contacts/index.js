import PaginatedController from '../paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { debounceTask } from 'ember-lifeline';
import {
  closeDeleteModal,
  confirmDeleteModal,
  openDeleteModal,
} from '../../utils/delete-modal';
import {
  contactFormToBody,
  contactToFormFields,
} from '../../utils/contact-form';
import { CONTACT_TAG_LABELS } from '../../helpers/contact-tag-label';

const ROLE_TABS = [
  { id: '', label: 'All' },
  ...Object.entries(CONTACT_TAG_LABELS).map(([id, label]) => ({ id, label })),
];

export default class ContactsIndexController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = [
    'page',
    'limit',
    'search',
    'tag',
    'agentId',
    'isWhatsapp',
    'company',
    'nationality',
    'dateFrom',
    'dateTo',
  ];
  @tracked search = '';
  @tracked tag = '';
  @tracked agentId = '';
  @tracked isWhatsapp = false;
  @tracked company = '';
  @tracked nationality = '';
  @tracked dateFrom = '';
  @tracked dateTo = '';

  roleTabs = ROLE_TABS;

  resetState() {
    this.search = '';
    this.tag = '';
    this.agentId = '';
    this.isWhatsapp = false;
    this.company = '';
    this.nationality = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.page = 1;
    this.showModal = false;
    this.editContact = null;
    this.errorMsg = '';
    this.isSaving = false;
    this.showDeleteModal = false;
    this.contactToDelete = null;
    this.isDeleting = false;
  }

  get agentOptions() {
    return [
      { value: '', label: 'Any agent' },
      ...(this.model?.agents || []).map((agent) => ({
        value: agent.id,
        label: agent.name,
      })),
    ];
  }

  get hasActiveFilters() {
    return Boolean(
      this.agentId ||
        this.isWhatsapp ||
        this.company ||
        this.nationality ||
        this.dateFrom ||
        this.dateTo,
    );
  }

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

  @action setTag(tabId) {
    this.tag = tabId;
    this.page = 1;
  }

  @action setAgentFilter(value) {
    this.agentId = value;
    this.page = 1;
  }

  @action toggleWhatsappFilter(checked) {
    this.isWhatsapp = checked;
    this.page = 1;
  }

  @action updateFilter(fieldName, e) {
    debounceTask(this, 'applyFilter', fieldName, e.target.value, 500);
  }

  applyFilter(fieldName, value) {
    this[fieldName] = value;
    this.page = 1;
  }

  @action setDateFrom(e) {
    this.dateFrom = e.target.value;
    this.page = 1;
  }

  @action setDateTo(e) {
    this.dateTo = e.target.value;
    this.page = 1;
  }

  @action clearFilters() {
    this.agentId = '';
    this.isWhatsapp = false;
    this.company = '';
    this.nationality = '';
    this.dateFrom = '';
    this.dateTo = '';
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
    Object.assign(this, contactToFormFields(contact));
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

    const body = isEdit
      ? contactFormToBody(this)
      : {
          ...(this.formFirstName ? { firstName: this.formFirstName } : {}),
          ...(this.formLastName ? { lastName: this.formLastName } : {}),
          ...(this.formEmail ? { email: this.formEmail } : {}),
          ...(this.formPhone ? { phone: this.formPhone } : {}),
          isWhatsapp: this.formIsWhatsapp,
          ...(this.formNationality
            ? { nationality: this.formNationality }
            : {}),
          ...(this.formNationalId
            ? { nationalId: this.formNationalId }
            : {}),
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
      this.router.refresh('contacts.index');
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
      refreshRoute: 'contacts.index',
    });
  }
}
