import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  AMENITY_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_SUB_TYPES,
  PROPERTY_TYPE_OPTIONS,
  UNIT_KIND_REQUIRED_ERROR,
} from 'land/constants';
import ContactSelection, {
  OWNER_REQUIRED_ERROR,
} from 'land/utils/contact-selection';
import { toggleArrayItem } from 'land/utils/toggle-array-item';

const VARIANTS = ['list', 'asset', 'unit'];

function formFrom(unit) {
  if (!unit) {
    return {
      city: null,
      locality: null,
      asset: null,
      unitNumber: '',
      status: 'available',
      propertyType: '',
      subType: '',
      price: '',
      sqFt: '',
      bedrooms: '',
      bathrooms: '',
      floor: '',
      description: '',
      amenities: [],
    };
  }
  return {
    city: null,
    locality: null,
    asset: null,
    unitNumber: unit.unitNumber ?? '',
    status: unit.status ?? 'available',
    propertyType: unit.propertyType ?? '',
    subType: unit.subType ?? '',
    price: unit.price ? String(unit.price) : '',
    sqFt: unit.sqFt ? String(unit.sqFt) : '',
    bedrooms: unit.bedrooms != null ? String(unit.bedrooms) : '',
    bathrooms: unit.bathrooms != null ? String(unit.bathrooms) : '',
    floor: unit.floor != null ? String(unit.floor) : '',
    description: unit.description ?? '',
    amenities: Array.isArray(unit.amenities) ? [...unit.amenities] : [],
  };
}

// @variant: list (create, picks city/location/asset), asset (create under @assetId or edit), unit (edit with floor and description).
export default class PropertiesPropertyDrawerComponent extends Component {
  @service auth;
  @service notifications;
  @service region;

  @tracked draft = null;
  @tracked isSaving = false;
  @tracked error = null;
  @tracked fieldError = null;
  @tracked selectionEpoch = 0;

  draftFor = null;

  statusOptions = PROPERTY_STATUS_OPTIONS;
  propertyTypeOptions = PROPERTY_TYPE_OPTIONS;
  subTypeOptions = PROPERTY_SUB_TYPES;
  amenityOptions = AMENITY_OPTIONS;

  get variant() {
    return VARIANTS.includes(this.args.variant) ? this.args.variant : 'asset';
  }

  get isList() {
    return this.variant === 'list';
  }

  get isAsset() {
    return this.variant === 'asset';
  }

  get isUnit() {
    return this.variant === 'unit';
  }

  get isEdit() {
    return !this.isList && Boolean(this.args.unit);
  }

  // Draft is keyed to variant, record and target asset.
  get source() {
    return `${this.variant}:${this.args.unit?.id ?? 'new'}:${this.args.assetId ?? ''}`;
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return formFrom(this.isEdit ? this.args.unit : null);
  }

  // Rebuilt per record and close.
  @cached
  get ownerSelection() {
    this.selectionEpoch;
    const selection = new ContactSelection();
    if (this.isEdit) selection.attach(this.args.unit?.owner ?? null);
    return selection;
  }

  get errorMsg() {
    return this.error?.source === this.source ? this.error.message : '';
  }

  set errorMsg(message) {
    this.error = message ? { source: this.source, message } : null;
  }

  get fieldErrors() {
    return this.fieldError?.source === this.source
      ? this.fieldError.errors
      : {};
  }

  get title() {
    return this.isEdit ? 'Edit Property' : 'New Property';
  }

  get submitLabel() {
    if (this.isList) return this.isSaving ? 'Creating...' : 'Create Property';
    if (this.isSaving) return 'Saving...';
    if (this.isUnit) return 'Update Property';
    return this.isEdit ? 'Update' : 'Create Property';
  }

  get showFields() {
    return !this.isList || Boolean(this.form.asset);
  }

  get citySearchUrl() {
    return this.region.regionCode ? '/locations/cities/search' : null;
  }

  get cityListUrl() {
    return this.region.regionCode
      ? `/locations/cities/${this.region.regionCode}`
      : null;
  }

  get cityCreatePayload() {
    return { regionCode: this.region.regionCode };
  }

  get localitySearchUrl() {
    const city = this.form.city;
    return city ? `/locations/localities/search?cityId=${city.id}` : null;
  }

  get localityListUrl() {
    const city = this.form.city;
    return city ? `/locations/localities/${city.id}` : null;
  }

  get localityCreatePayload() {
    return this.form.city ? { cityId: this.form.city.id } : {};
  }

  get assetSearchUrl() {
    const locality = this.form.locality;
    return locality
      ? `/properties/assets/search?localityId=${locality.id}`
      : null;
  }

  get assetListUrl() {
    const locality = this.form.locality;
    return locality
      ? `/properties/assets/list?localityId=${locality.id}`
      : null;
  }

  get assetCreatePayload() {
    return this.form.locality ? { localityId: this.form.locality.id } : {};
  }

  update(changes) {
    this.draftFor = this.source;
    this.draft = { ...this.form, ...changes };
  }

  dropFieldErrors(...names) {
    const errors = { ...this.fieldErrors };
    if (!names.some((name) => name in errors)) return;
    names.forEach((name) => delete errors[name]);
    this.fieldError = { source: this.source, errors };
  }

  @action setField(name, value) {
    this.update({ [name]: value });
    this.dropFieldErrors(name);
  }

  @action toggleAmenity(key) {
    this.update({ amenities: toggleArrayItem(this.form.amenities, key) });
  }

  @action selectCity(city) {
    this.update({ city, locality: null, asset: null });
    this.dropFieldErrors('city', 'locality', 'asset');
  }

  @action clearCity() {
    this.update({ city: null, locality: null, asset: null });
    this.dropFieldErrors('city', 'locality', 'asset');
  }

  @action selectLocality(locality) {
    this.update({ locality, asset: null });
    this.dropFieldErrors('locality', 'asset');
  }

  @action clearLocality() {
    this.update({ locality: null, asset: null });
    this.dropFieldErrors('locality', 'asset');
  }

  @action selectAsset(asset) {
    this.update({ asset });
    this.dropFieldErrors('asset');
  }

  @action clearAsset() {
    this.update({ asset: null });
    this.dropFieldErrors('asset');
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.draftFor = null;
    this.selectionEpoch += 1;
    this.errorMsg = '';
    this.fieldError = null;
    this.args.onClosed?.();
  }

  validate(form) {
    const fields = {};
    if (this.isList) {
      if (!form.city) fields.city = 'Choose a city';
      else if (!form.locality) fields.locality = 'Choose a location';
      else if (!form.asset) fields.asset = 'Choose an asset';
    }
    if (!form.unitNumber.trim()) fields.unitNumber = 'Enter a property number';
    if (!form.subType) fields.subType = UNIT_KIND_REQUIRED_ERROR;
    const owner = this.ownerSelection.isPresent ? '' : OWNER_REQUIRED_ERROR;
    return { fields, owner };
  }

  buildBody(form) {
    const isEdit = this.isEdit;
    const owner = this.ownerSelection;
    let assetId = null;
    if (!isEdit) assetId = this.isList ? form.asset.id : this.args.assetId;

    let propertyType = {};
    if (form.propertyType) propertyType = { propertyType: form.propertyType };
    else if (isEdit) propertyType = { propertyType: null };

    return {
      ...(isEdit ? {} : { assetId }),
      unitNumber: this.isList ? form.unitNumber.trim() : form.unitNumber,
      status: form.status,
      subType: form.subType,
      ...propertyType,
      ...(form.price ? { price: parseFloat(form.price) } : {}),
      ...(form.sqFt ? { sqFt: parseFloat(form.sqFt) } : {}),
      ...(form.bedrooms ? { bedrooms: parseInt(form.bedrooms, 10) } : {}),
      ...(form.bathrooms ? { bathrooms: Number(form.bathrooms) } : {}),
      ...(this.isUnit && form.floor ? { floor: form.floor } : {}),
      ...(this.isUnit && form.description
        ? { description: form.description }
        : {}),
      ...(owner.contactId
        ? {
            ownerId: owner.contactId,
            ...owner.verifyPhoneField('ownerVerifyPhone'),
          }
        : { owner: owner.cleanIdentity }),
      ...(this.isList ? {} : { amenities: form.amenities }),
    };
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;

    const form = this.form;
    const { fields, owner } = this.validate(form);
    if (owner || Object.keys(fields).length > 0) {
      this.fieldError = { source: this.source, errors: fields };
      this.errorMsg = owner;
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';
    this.fieldError = null;

    const isEdit = this.isEdit;
    const path = isEdit
      ? `/properties/units/${this.args.unit.id}`
      : '/properties/units';

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(this.buildBody(form)),
      });
      this.notifications.success(
        isEdit ? 'Property updated' : 'Property created',
      );
      this.close();
      this.args.onSaved?.();
    } catch (e) {
      this.errorMsg = this.ownerSelection.takeConflict(e)
        ? 'Contact already added'
        : e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
