import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

function formFrom(asset, defaultLocality) {
  if (asset) {
    return {
      name: asset.name,
      address: asset.address ?? '',
      city: null,
      locality: null,
    };
  }
  return {
    name: '',
    address: '',
    city: defaultLocality?.city ?? null,
    locality: defaultLocality ?? null,
  };
}

// No @asset means create; @defaultLocality preselects the city and location.
export default class PropertiesAssetDrawerComponent extends Component {
  @service auth;
  @service notifications;
  @service region;

  @tracked draft = null;
  @tracked isSaving = false;
  @tracked error = null;
  @tracked fieldError = null;

  draftFor = null;

  // Draft and error are keyed to the record they were made for.
  get source() {
    return this.args.asset?.id ?? 'new';
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return formFrom(this.args.asset, this.args.defaultLocality);
  }

  get isEdit() {
    return Boolean(this.args.asset);
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

  get submitLabel() {
    if (this.isSaving) return 'Saving...';
    return this.isEdit ? 'Update' : 'Create Asset';
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

  @action selectCity(city) {
    this.update({ city, locality: null });
    this.dropFieldErrors('city', 'locality');
  }

  @action clearCity() {
    this.update({ city: null, locality: null });
    this.dropFieldErrors('city', 'locality');
  }

  @action selectLocality(locality) {
    this.update({ locality });
    this.dropFieldErrors('locality');
  }

  @action clearLocality() {
    this.update({ locality: null });
    this.dropFieldErrors('locality');
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.draftFor = null;
    this.errorMsg = '';
    this.fieldError = null;
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;

    const form = this.form;
    const isEdit = this.isEdit;
    const fields = {};
    if (!isEdit) {
      if (!form.city) fields.city = 'Choose a city';
      else if (!form.locality) fields.locality = 'Choose a location';
    }
    if (!form.name.trim()) fields.name = 'Enter an asset name';
    if (Object.keys(fields).length > 0) {
      this.fieldError = { source: this.source, errors: fields };
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';
    this.fieldError = null;

    const path = isEdit
      ? `/properties/assets/${this.args.asset.id}`
      : '/properties/assets';

    const body = {
      name: form.name,
      ...(!isEdit ? { localityId: form.locality.id } : {}),
      ...(form.address ? { address: form.address } : {}),
    };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Asset updated' : 'Asset created');
      this.close();
      this.args.onSaved?.();
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
