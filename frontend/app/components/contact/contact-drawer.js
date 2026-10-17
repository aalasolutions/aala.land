import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  contactFormToBody,
  contactToFormFields,
} from 'land/utils/contact-form';

const OPTIONAL_CREATE_FIELDS = {
  formFirstName: 'firstName',
  formLastName: 'lastName',
  formEmail: 'email',
  formPhone: 'phone',
  formNationality: 'nationality',
  formNationalId: 'nationalId',
  formContactCompany: 'contactCompany',
  formJobTitle: 'jobTitle',
  formAddress: 'address',
  formNotes: 'notes',
};

// No @contact means create.
export default class ContactContactDrawerComponent extends Component {
  @service auth;
  @service notifications;

  @tracked draft = null;
  @tracked isSaving = false;
  @tracked error = null;
  @tracked fieldError = null;

  draftFor = null;

  // Draft and error are keyed to the record they were made for.
  get source() {
    return this.args.contact?.id ?? 'new';
  }

  get fieldErrors() {
    return this.fieldError?.source === this.source
      ? this.fieldError.errors
      : {};
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return contactToFormFields(this.args.contact);
  }

  get isEdit() {
    return Boolean(this.args.contact);
  }

  get errorMsg() {
    return this.error?.source === this.source ? this.error.message : '';
  }

  get submitLabel() {
    if (this.isSaving) return 'Saving...';
    return this.isEdit ? 'Update' : 'Create Contact';
  }

  dropFieldErrors(...names) {
    const errors = { ...this.fieldErrors };
    if (!names.some((name) => name in errors)) return;
    names.forEach((name) => delete errors[name]);
    this.fieldError = { source: this.source, errors };
  }

  @action setField(name, value) {
    this.draftFor = this.source;
    this.draft = { ...this.form, [name]: value };
    this.dropFieldErrors(name);
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

  validate(form) {
    const errors = {};
    if (!form.formFirstName?.trim())
      errors.formFirstName = 'Enter a first name';
    if (!form.formPhone?.trim()) errors.formPhone = 'Enter a phone number';
    return errors;
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;

    const form = this.form;
    const errors = this.validate(form);
    if (Object.keys(errors).length > 0) {
      this.fieldError = { source: this.source, errors };
      return;
    }

    this.isSaving = true;
    this.error = null;
    this.fieldError = null;

    const isEdit = this.isEdit;
    const source = this.source;
    const path = isEdit ? `/contacts/${this.args.contact.id}` : '/contacts';

    let body = contactFormToBody(form);
    if (!isEdit) {
      body = { isWhatsapp: form.formIsWhatsapp };
      for (const [field, key] of Object.entries(OPTIONAL_CREATE_FIELDS)) {
        if (form[field]) body[key] = form[field];
      }
    }

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(
        isEdit ? 'Contact updated' : 'Contact created',
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
