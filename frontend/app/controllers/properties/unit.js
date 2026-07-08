import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { closeDeleteModal, confirmDeleteModal, openDeleteModal } from '../../utils/delete-modal';
import { toggleArrayItem } from '../../utils/toggle-array-item';
import { PROPERTY_STATUS_OPTIONS, PROPERTY_TYPE_OPTIONS } from 'land/constants';


export default class PropertiesUnitController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  // Edit modal state
  @tracked showEditModal = false;
  @tracked isSaving = false;
  @tracked errorMsg = '';

  // Photo upload state
  @tracked isUploading = false;
  @tracked uploadStatus = '';
  @tracked previewUrl = null;

  // Delete confirmation state
  @tracked showDeleteModal = false;
  @tracked itemToDelete = null;
  @tracked isDeleting = false;

  // Form fields
  @tracked formUnitNumber = '';
  @tracked formStatus = 'available';
  @tracked formPropertyType = '';
  @tracked formPrice = '';
  @tracked formSqFt = '';
  @tracked formBedrooms = '';
  @tracked formBathrooms = '';
  @tracked formFloor = '';
  @tracked formDescription = '';
  @tracked formOwnerId = '';
  @tracked formAmenities = [];

  statusOptions = PROPERTY_STATUS_OPTIONS;

  propertyTypeOptions = PROPERTY_TYPE_OPTIONS;

  get ownerOptions() {
    return [
      { value: '', label: 'Unassigned' },
      ...(this.model.owners || []).map(owner => ({
        value: owner.id,
        label: owner.name
      }))
    ];
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  @action toggleAmenity(key) {
    this.formAmenities = toggleArrayItem(this.formAmenities, key);
  }

  @action openEdit() {
    const unit = this.model?.unit;
    if (!unit) return;

    this.formUnitNumber = unit.unitNumber ?? '';
    this.formStatus = unit.status ?? 'available';
    this.formPropertyType = unit.propertyType ?? '';
    this.formPrice = unit.price ? String(unit.price) : '';
    this.formSqFt = unit.sqFt ? String(unit.sqFt) : '';
    this.formBedrooms = unit.bedrooms != null ? String(unit.bedrooms) : '';
    this.formBathrooms = unit.bathrooms != null ? String(unit.bathrooms) : '';
    this.formFloor = unit.floor != null ? String(unit.floor) : '';
    this.formDescription = unit.description ?? '';
    this.formOwnerId = unit.ownerId || '';
    this.formAmenities = Array.isArray(unit.amenities) ? [...unit.amenities] : [];
    this.errorMsg = '';
    this.showEditModal = true;
  }

  @action closeEdit() {
    this.showEditModal = false;
    this.errorMsg = '';
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

      // Do NOT set Content-Type in the options object when sending FormData.
      // The browser sets multipart/form-data with the boundary automatically.
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

  @action async setPrimaryPhoto(media) {
    try {
      await this.auth.fetchJson(`/properties/media/${media.id}/set-primary`, { method: 'PATCH' });
      this.notifications.success('Primary photo updated');
      this.router.refresh('properties.unit');
    } catch (err) {
      this.notifications.error(err.message || 'Failed to set primary');
    }
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const unit = this.model?.unit;
    if (!unit) return;

    const body = {
      unitNumber: this.formUnitNumber,
      status: this.formStatus,
      ...(this.formPropertyType ? { propertyType: this.formPropertyType } : { propertyType: null }),
      ...(this.formPrice ? { price: parseFloat(this.formPrice) } : {}),
      ...(this.formSqFt ? { sqFt: parseFloat(this.formSqFt) } : {}),
      ...(this.formBedrooms ? { bedrooms: parseInt(this.formBedrooms, 10) } : {}),
      ...(this.formBathrooms ? { bathrooms: parseInt(this.formBathrooms, 10) } : {}),
      ...(this.formFloor ? { floor: this.formFloor } : {}),
      ...(this.formDescription ? { description: this.formDescription } : {}),
      ownerId: this.formOwnerId || null,
      amenities: this.formAmenities,
    };

    try {
      await this.auth.fetchJson(`/properties/units/${unit.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      this.notifications.success('Unit updated');
      this.closeEdit();
      this.router.refresh('properties.unit');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
