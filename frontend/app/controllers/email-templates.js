import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  closeDeleteModal,
  confirmDeleteModal,
  openDeleteModal,
} from '../utils/delete-modal';
import { EMAIL_FILTER_CATEGORIES } from 'land/constants';

export default class EmailTemplatesController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit', 'category'];
  @tracked page = 1;
  @tracked limit = 50;
  @tracked category = '';

  @tracked showModal = false;
  @tracked editTemplate = null;

  @tracked showPreview = false;
  @tracked previewSubject = '';
  @tracked previewBody = '';
  @tracked previewVars = '';
  @tracked showDeleteModal = false;
  @tracked templateToDelete = null;
  @tracked isDeleting = false;

  get filterCategories() {
    return EMAIL_FILTER_CATEGORIES;
  }

  @action filterCategory(value) {
    this.category = value;
    this.page = 1;
  }

  @action openCreate() {
    this.editTemplate = null;
    this.showModal = true;
  }

  @action openEdit(template) {
    this.editTemplate = template;
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
    this.editTemplate = null;
  }

  @action refresh() {
    this.router.refresh('email-templates');
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
      const result = await this.auth.fetchJson(
        `/email-templates/${template.id}/render`,
        {
          method: 'POST',
          body: JSON.stringify({ variables: sampleVars }),
        },
      );
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
