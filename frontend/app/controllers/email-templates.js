import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { closeDeleteModal, confirmDeleteModal, openDeleteModal } from '../utils/delete-modal';

const CATEGORIES = [
  { value: 'FOLLOW_UP', label: 'Follow Up' },
  { value: 'WELCOME', label: 'Welcome' },
  { value: 'LEASE_RENEWAL', label: 'Lease Renewal' },
  { value: 'PAYMENT_REMINDER', label: 'Payment Reminder' },
  { value: 'MAINTENANCE_UPDATE', label: 'Maintenance Update' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'CUSTOM', label: 'Custom' },
];

const FILTER_CATEGORIES = [
  { value: '', label: 'All Categories' },
  ...CATEGORIES,
];

export default class EmailTemplatesController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit', 'category'];
  @tracked page = 1;
  @tracked limit = 20;
  @tracked category = '';

  @tracked showModal = false;
  @tracked editTemplate = null;
  @tracked formName = '';
  @tracked formSubject = '';
  @tracked formBody = '';
  @tracked formCategory = 'CUSTOM';
  @tracked formVariables = '';
  @tracked formIsActive = true;
  @tracked isSaving = false;
  @tracked errorMsg = '';

  @tracked showPreview = false;
  @tracked previewSubject = '';
  @tracked previewBody = '';
  @tracked previewVars = '';
  @tracked showDeleteModal = false;
  @tracked templateToDelete = null;
  @tracked isDeleting = false;

  get categories() {
    return CATEGORIES;
  }

  get filterCategories() {
    return FILTER_CATEGORIES;
  }

  @action setField(fieldName, e) {
    if (fieldName === 'formIsActive') {
      this[fieldName] = e.target.checked;
    } else {
      this[fieldName] = e.target.value;
    }
  }

  @action filterCategory(e) {
    this.category = e.target.value;
    this.page = 1;
  }

  @action openCreate() {
    this.formName = '';
    this.formSubject = '';
    this.formBody = '';
    this.formCategory = 'CUSTOM';
    this.formVariables = '';
    this.formIsActive = true;
    this.editTemplate = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(template) {
    this.formName = template.name ?? '';
    this.formSubject = template.subject ?? '';
    this.formBody = template.body ?? '';
    this.formCategory = template.category ?? 'CUSTOM';
    this.formVariables = Array.isArray(template.variables) ? template.variables.join(', ') : '';
    this.formIsActive = template.isActive !== false;
    this.editTemplate = template;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editTemplate = null;
    this.errorMsg = '';
  }

  @action async saveTemplate(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editTemplate;
    const path = isEdit ? `/email-templates/${this.editTemplate.id}` : '/email-templates';

    const variables = this.formVariables
      ? this.formVariables.split(',').map(v => v.trim()).filter(Boolean)
      : [];

    const body = {
      name: this.formName,
      subject: this.formSubject,
      body: this.formBody,
      category: this.formCategory,
      variables,
      isActive: this.formIsActive,
    };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Template updated' : 'Template created');
      this.closeModal();
      this.router.refresh('email-templates');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  @action openDelete(template) {
    openDeleteModal(this, 'templateToDelete', template);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'templateToDelete');
  }

  @action async confirmDelete() {
    await confirmDeleteModal(this, {
      itemKey: 'templateToDelete',
      resourcePath: '/email-templates',
      successMessage: 'Template deleted',
      refreshRoute: 'email-templates',
    });
  }

  @action async openPreview(template) {
    this.previewVars = '';
    this.previewSubject = '';
    this.previewBody = '';

    const vars = Array.isArray(template.variables) ? template.variables : [];
    const sampleVars = {};
    for (const v of vars) {
      sampleVars[v] = `[${v}]`;
    }

    try {
      const result = await this.auth.fetchJson(`/email-templates/${template.id}/render`, {
        method: 'POST',
        body: JSON.stringify({ variables: sampleVars }),
      });
      this.previewSubject = result.data?.subject || template.subject;
      this.previewBody = result.data?.body || template.body;
      this.previewVars = vars.join(', ');
      this.showPreview = true;
    } catch (e) {
      this.notifications.error('Preview failed: ' + e.message);
    }
  }

  @action closePreview() {
    this.showPreview = false;
  }
}
