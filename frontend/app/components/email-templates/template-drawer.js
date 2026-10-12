import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { EMAIL_CATEGORIES } from 'land/constants';

function formFrom(template) {
  if (!template) {
    return {
      formName: '',
      formSubject: '',
      formBody: '',
      formCategory: 'CUSTOM',
      formVariables: '',
      formIsActive: true,
    };
  }
  return {
    formName: template.name ?? '',
    formSubject: template.subject ?? '',
    formBody: template.body ?? '',
    formCategory: template.category ?? 'CUSTOM',
    formVariables: Array.isArray(template.variables)
      ? template.variables.join(', ')
      : '',
    formIsActive: template.isActive !== false,
  };
}

// No @template means create.
export default class EmailTemplatesTemplateDrawerComponent extends Component {
  @service auth;
  @service notifications;

  @tracked draft = null;
  @tracked isSaving = false;
  @tracked error = null;

  draftFor = null;
  categories = EMAIL_CATEGORIES;

  // Draft and error are keyed to the record they were made for.
  get source() {
    return this.args.template?.id ?? 'new';
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return formFrom(this.args.template);
  }

  get isEdit() {
    return Boolean(this.args.template);
  }

  get errorMsg() {
    return this.error?.source === this.source ? this.error.message : '';
  }

  get submitLabel() {
    if (this.isSaving) return 'Saving...';
    return this.isEdit ? 'Update' : 'Create Template';
  }

  @action setField(name, value) {
    this.draftFor = this.source;
    this.draft = { ...this.form, [name]: value };
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.draftFor = null;
    this.error = null;
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.error = null;

    const form = this.form;
    const source = this.source;
    const isEdit = this.isEdit;
    const path = isEdit
      ? `/email-templates/${this.args.template.id}`
      : '/email-templates';

    const variables = form.formVariables
      ? form.formVariables
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : [];

    const body = {
      name: form.formName,
      subject: form.formSubject,
      body: form.formBody,
      category: form.formCategory,
      variables,
      isActive: form.formIsActive,
    };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(
        isEdit ? 'Template updated' : 'Template created',
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
