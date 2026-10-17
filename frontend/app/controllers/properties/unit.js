import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  closeDeleteModal,
  confirmDeleteModal,
  openDeleteModal,
} from '../../utils/delete-modal';
import { ROLES, canViewRecordHistory } from '../../utils/roles';

const ARCHIVE_ROLES = [ROLES.COMPANY_ADMIN, ROLES.ADMIN, ROLES.MANAGER];
const DELETE_ROLES = [ROLES.COMPANY_ADMIN, ROLES.ADMIN];

const UNIT_ACTIONS = {
  archive: {
    title: 'Archive Property',
    message:
      'Archive this property? It becomes read-only and hidden from lists. You can unarchive it later.',
    confirmText: 'Archive',
    confirmingText: 'Archiving...',
    confirmVariant: 'primary',
    reasonRequired: true,
    successMessage: 'Property archived',
    errorMessage: 'Archive failed',
  },
  unarchive: {
    title: 'Unarchive Property',
    message: 'Unarchive this property? It becomes active and editable again.',
    confirmText: 'Unarchive',
    confirmingText: 'Unarchiving...',
    confirmVariant: 'primary',
    reasonRequired: false,
    successMessage: 'Property unarchived',
    errorMessage: 'Unarchive failed',
  },
  delete: {
    title: 'Delete Property',
    message:
      'Delete this property? Its photos and documents are deleted too. This cannot be undone.',
    confirmText: 'Delete',
    confirmingText: 'Deleting...',
    confirmVariant: 'danger',
    reasonRequired: true,
    successMessage: 'Property deleted',
    errorMessage: 'Delete failed',
  },
};

export default class PropertiesUnitController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked showEditModal = false;

  leaseColumns = [
    {
      name: 'Tenant',
      valuePath: 'contact.displayName',
      width: 220,
      isFixed: 'left',
    },
    { name: 'Start', valuePath: 'startDate', width: 140 },
    { name: 'End', valuePath: 'endDate', width: 140 },
    { name: 'Rent', valuePath: 'monthlyRent', width: 140, numeric: true },
    { name: 'Status', valuePath: 'status', width: 160 },
  ];

  @tracked isUploading = false;
  @tracked uploadStatus = '';
  @tracked previewUrl = null;
  @tracked activePhotoId = null;

  @tracked showDeleteModal = false;
  @tracked itemToDelete = null;
  @tracked isDeleting = false;

  @tracked pendingUnitAction = null;
  @tracked unitActionReason = '';
  @tracked reasonError = '';
  @tracked isSubmittingUnitAction = false;

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  // Kit form components call onInput/onChange as (value, event).
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
    if (fieldName === 'unitActionReason') this.reasonError = '';
  }

  @action openEdit() {
    if (!this.model?.unit) return;
    this.showEditModal = true;
  }

  @action closeEdit() {
    this.showEditModal = false;
  }

  @action refresh() {
    this.router.refresh('properties.unit');
  }

  @action async uploadPhoto(e) {
    const file = e.target.files?.[0];
    if (!file || this.isUploading) return;

    const unit = this.model?.unit;
    if (!unit) return;

    // Client-side type guard mirrors backend allowlist. GIF excluded.
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      this.notifications.error('Only JPEG, PNG, and WebP images are allowed');
      e.target.value = '';
      return;
    }

    // Client-side size guard mirrors backend 5 MB limit.
    if (file.size > 5 * 1024 * 1024) {
      this.notifications.error('Image must be 5 MB or smaller');
      e.target.value = '';
      return;
    }

    // Show immediate client-side preview while upload is in progress.
    this.revokePreview();
    this.previewUrl = URL.createObjectURL(file);

    this.isUploading = true;
    this.uploadStatus = 'Uploading...';

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('unitId', unit.id);
      formData.append('type', 'image'); // lowercase matches MediaType.IMAGE = 'image'

      // Do NOT set Content-Type for FormData; the browser sets multipart boundary automatically.
      await this.auth.fetchJson('/properties/media/upload', {
        method: 'POST',
        body: formData,
      });

      this.notifications.success('Photo uploaded');
      this.revokePreview();
      this.router.refresh('properties.unit');
    } catch (err) {
      if (err.message?.toLowerCase().includes('storage quota')) {
        this.notifications.error(
          'Storage quota exceeded. Add a seat or top up storage to upload more photos.',
        );
      } else {
        this.notifications.error(err.message || 'Upload failed');
      }
      this.revokePreview();
    } finally {
      this.isUploading = false;
      this.uploadStatus = '';
      e.target.value = '';
    }
  }

  revokePreview() {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }

  @action openDeletePhoto(media) {
    openDeleteModal(this, 'itemToDelete', media);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'itemToDelete');
  }

  @action async confirmDeletePhoto() {
    await confirmDeleteModal(this, {
      itemKey: 'itemToDelete',
      resourcePath: '/properties/media',
      successMessage: 'Photo deleted',
      refreshRoute: 'properties.unit',
      errorMessage: 'Delete failed',
    });
  }

  get activePhoto() {
    const media = this.model?.media ?? [];
    return media.find((m) => m.id === this.activePhotoId) ?? media[0];
  }

  @action selectPhoto(media) {
    this.activePhotoId = media.id;
  }

  @action async setPrimaryPhoto(media) {
    try {
      await this.auth.fetchJson(`/properties/media/${media.id}/set-primary`, {
        method: 'PATCH',
      });
      this.notifications.success('Primary photo updated');
      this.router.refresh('properties.unit');
    } catch (err) {
      this.notifications.error(err.message || 'Failed to set primary');
    }
  }

  get isArchived() {
    return Boolean(this.model?.unit?.deletedAt);
  }

  get crumbs() {
    const crumbs = [{ label: 'Properties', route: 'properties' }];
    const locality = this.model?.unit?.asset?.locality;
    if (locality && this.model.areaId) {
      crumbs.push({
        label: locality.name,
        route: 'properties.detail',
        model: this.model.areaId,
      });
    }
    return crumbs;
  }

  // Matches the label the server returns for a unit link.
  get documentLinkLabel() {
    const unit = this.model?.unit;
    const unitNumber = unit?.unitNumber ?? '';
    const assetName = unit?.asset?.name;
    return assetName ? `${assetName} ${unitNumber}`.trim() : unitNumber;
  }

  get canArchiveUnit() {
    return ARCHIVE_ROLES.includes(this.auth.currentUser?.role);
  }

  get canDeleteUnit() {
    return DELETE_ROLES.includes(this.auth.currentUser?.role);
  }

  get canViewHistory() {
    return canViewRecordHistory(this.auth.currentUser?.role);
  }

  get unitActionConfig() {
    return UNIT_ACTIONS[this.pendingUnitAction] ?? null;
  }

  get showUnitActionModal() {
    return Boolean(this.unitActionConfig);
  }

  @action openUnitAction(kind) {
    this.pendingUnitAction = kind;
    this.unitActionReason = '';
    this.reasonError = '';
  }

  @action closeUnitAction() {
    this.pendingUnitAction = null;
    this.unitActionReason = '';
    this.reasonError = '';
  }

  @action async confirmUnitAction() {
    const kind = this.pendingUnitAction;
    const config = this.unitActionConfig;
    const unit = this.model?.unit;
    if (!config || !unit || this.isSubmittingUnitAction) return;

    const reason = this.unitActionReason.trim();
    if (config.reasonRequired && !reason) {
      this.reasonError = 'Enter a reason';
      return;
    }

    this.isSubmittingUnitAction = true;
    this.reasonError = '';

    try {
      await this.auth.fetchJson(`/properties/units/${unit.id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify(reason ? { reason } : {}),
      });
      this.notifications.success(config.successMessage);
      this.closeUnitAction();
      if (kind === 'delete') {
        this.router.transitionTo('properties');
      } else {
        this.router.refresh('properties.unit');
      }
    } catch (e) {
      this.notifications.error(e.message || config.errorMessage);
    } finally {
      this.isSubmittingUnitAction = false;
    }
  }
}
