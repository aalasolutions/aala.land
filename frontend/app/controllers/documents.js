import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { closeDeleteModal, confirmDeleteModal, openDeleteModal } from '../utils/delete-modal';

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

export default class DocumentsController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit', 'category'];
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

  categoryOptions = CATEGORIES.filter((c) => c.value !== '');

  accessLevels = ACCESS_LEVELS;

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
      if (isEdit) {
        // Edit path: metadata-only PATCH. File replacement is out of scope.
        const body = {
          name:        this.formName,
          category:    this.formCategory,
          accessLevel: this.formAccessLevel,
        };
        await this.auth.fetchJson(`/documents/${this.editDocument.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        this.notifications.success('Document updated');
      } else {
        // Create path: single multipart POST.
        if (!this.selectedFile) {
          throw new Error('Please select a file to upload');
        }
        this.uploadProgress = 'Uploading...';

        const formData = new FormData();
        formData.append('file', this.selectedFile);
        formData.append('name', this.formName);
        formData.append('category', this.formCategory);
        formData.append('accessLevel', this.formAccessLevel);

        await this.auth.fetchJson('/documents/upload', {
          method: 'POST',
          body: formData,
        });
        this.notifications.success('Document uploaded');
      }

      this.closeModal();
      this.router.refresh('documents');
    } catch (err) {
      if (err.message?.toLowerCase().includes('storage quota')) {
        this.errorMsg =
          'Storage quota exceeded. Add a seat or top up storage to upload more files.';
      } else {
        this.errorMsg = err.message || 'Save failed';
      }
    } finally {
      this.isSaving = false;
      this.uploadProgress = '';
    }
  }

  @action openDelete(doc) {
    openDeleteModal(this, 'documentToDelete', doc);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'documentToDelete');
  }

  @action async confirmDelete() {
    await confirmDeleteModal(this, {
      itemKey: 'documentToDelete',
      resourcePath: '/documents',
      successMessage: 'Document deleted',
      refreshRoute: 'documents',
    });
  }

  @action async downloadDocument(doc) {
    try {
      const res = await this.auth.authorizedFetch(`${this.auth.apiBase}/documents/${doc.id}/download`);
      if (!res.ok) {
        throw new Error('Download failed');
      }

      // The endpoint re-checks accessLevel and streams bytes directly — the S3 URL
      // is never exposed to the client, so a blob download replaces window.open(doc.url).
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = doc.name || 'document';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      this.notifications.error(err.message || 'Download failed');
    }
  }
}
