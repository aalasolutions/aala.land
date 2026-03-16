import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { AMENITY_OPTIONS } from '../../constants/amenities';

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

  get amenityOptions() { return AMENITY_OPTIONS; }

  get buildingPropertyType() {
    return this.model?.unit?.building?.propertyType ?? 'RENTAL';
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  @action toggleAmenity(key) {
    const current = [...this.formAmenities];
    const idx = current.indexOf(key);
    if (idx === -1) {
      current.push(key);
    } else {
      current.splice(idx, 1);
    }
    this.formAmenities = current;
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

    this.isUploading = true;
    this.uploadStatus = 'Getting upload URL...';

    try {
      // Step 1: Get presigned URL
      const presigned = await this.auth.fetchJson('/properties/media/presigned-url', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          unitId: unit.id,
        }),
      });

      const { uploadUrl, fileUrl, key } = presigned.data;

      // Step 2: Upload file directly to S3/MinIO
      this.uploadStatus = 'Uploading photo...';
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadRes.ok) {
        throw new Error('File upload to storage failed');
      }

      // Step 3: Create media record in DB
      this.uploadStatus = 'Saving record...';
      await this.auth.fetchJson('/properties/media', {
        method: 'POST',
        body: JSON.stringify({
          url: fileUrl,
          s3Key: key,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
          unitId: unit.id,
          type: 'image',
        }),
      });

      this.notifications.success('Photo uploaded');
      this.router.refresh('properties.unit');
    } catch (err) {
      this.notifications.error(err.message || 'Upload failed');
    } finally {
      this.isUploading = false;
      this.uploadStatus = '';
      // Reset the file input
      e.target.value = '';
    }
  }

  @action async deletePhoto(media) {
    if (!confirm('Delete this photo?')) return;

    try {
      await this.auth.fetchJson(`/properties/media/${media.id}`, { method: 'DELETE' });
      this.notifications.success('Photo deleted');
      this.router.refresh('properties.unit');
    } catch (err) {
      this.notifications.error(err.message || 'Delete failed');
    }
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
      ...(this.formFloor ? { floor: parseInt(this.formFloor, 10) } : {}),
      ...(this.formDescription ? { description: this.formDescription } : {}),
      ...(this.formOwnerId ? { ownerId: this.formOwnerId } : {}),
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
