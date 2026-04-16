import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'LEASE', label: 'Lease' },
  { value: 'EJARI', label: 'Ejari' },
  { value: 'TITLE_DEED', label: 'Title Deed' },
  { value: 'ID_COPY', label: 'ID Copy' },
  { value: 'NOC', label: 'NOC' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'OTHER', label: 'Other' },
];

const ACCESS_LEVELS = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'COMPANY', label: 'Company' },
  { value: 'OWNER_ONLY', label: 'Owner Only' },
  { value: 'ADMIN_ONLY', label: 'Admin Only' },
];

export default class DocumentsController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit', 'category'];
  @tracked page = 1;
  @tracked limit = 20;
  @tracked category = '';

  @tracked showModal = false;
  @tracked editDocument = null;
  @tracked formName = '';
  @tracked formCategory = 'OTHER';
  @tracked formAccessLevel = 'COMPANY';
  @tracked isSaving = false;
  @tracked errorMsg = '';

  // Upload state
  @tracked selectedFile = null;
  @tracked uploadProgress = '';
  @tracked showDeleteModal = false;
  @tracked documentToDelete = null;
  @tracked isDeleting = false;

  get categories() {
    return CATEGORIES;
  }

  get categoryOptions() {
    return CATEGORIES.filter((c) => c.value !== '');
  }

  get accessLevels() {
    return ACCESS_LEVELS;
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  @action setCategory(e) {
    this.category = e.target.value;
    this.page = 1;
  }

  @action onFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) {
      this.selectedFile = file;
      if (!this.formName) {
        this.formName = file.name;
      }
    }
  }

  @action openCreate() {
    this.formName = '';
    this.formCategory = 'OTHER';
    this.formAccessLevel = 'COMPANY';
    this.selectedFile = null;
    this.uploadProgress = '';
    this.editDocument = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(doc) {
    this.formName = doc.name ?? '';
    this.formCategory = doc.category ?? 'OTHER';
    this.formAccessLevel = doc.accessLevel ?? 'COMPANY';
    this.selectedFile = null;
    this.uploadProgress = '';
    this.editDocument = doc;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editDocument = null;
    this.errorMsg = '';
    this.selectedFile = null;
    this.uploadProgress = '';
  }

  @action async saveDocument(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editDocument;

    try {
      let url = isEdit ? this.editDocument.url : null;
      let fileType = isEdit ? this.editDocument.fileType : null;

      // Upload file if selected
      if (this.selectedFile) {
        this.uploadProgress = 'Getting upload URL...';
        const presigned = await this.auth.fetchJson('/documents/presigned-url', {
          method: 'POST',
          body: JSON.stringify({
            fileName: this.selectedFile.name,
            contentType: this.selectedFile.type,
          }),
        });

        const { uploadUrl, fileUrl } = presigned.data;

        this.uploadProgress = 'Uploading file...';
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: this.selectedFile,
          headers: { 'Content-Type': this.selectedFile.type },
        });

        if (!uploadRes.ok) {
          throw new Error('File upload to storage failed');
        }

        url = fileUrl;
        fileType = this.selectedFile.type;
        this.uploadProgress = 'Saving record...';
      }

      if (!url && !isEdit) {
        throw new Error('Please select a file to upload');
      }

      const body = {
        name: this.formName,
        category: this.formCategory,
        accessLevel: this.formAccessLevel,
        ...(url ? { url } : {}),
        ...(fileType ? { fileType } : {}),
      };

      const path = isEdit ? `/documents/${this.editDocument.id}` : '/documents';
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });

      this.notifications.success(isEdit ? 'Document updated' : 'Document uploaded');
      this.closeModal();
      this.router.refresh('documents');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
      this.uploadProgress = '';
    }
  }

  @action openDelete(doc) {
    this.documentToDelete = doc;
    this.showDeleteModal = true;
  }

  @action closeDeleteModal() {
    this.showDeleteModal = false;
    this.documentToDelete = null;
  }

  @action async confirmDelete() {
    if (!this.documentToDelete || this.isDeleting) return;

    this.isDeleting = true;
    try {
      await this.auth.fetchJson(`/documents/${this.documentToDelete.id}`, { method: 'DELETE' });
      this.notifications.success('Document deleted');
      this.closeDeleteModal();
      this.router.refresh('documents');
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.isDeleting = false;
    }
  }

  @action downloadDocument(doc) {
    window.open(doc.url, '_blank');
  }
}
