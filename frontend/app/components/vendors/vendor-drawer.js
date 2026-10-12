import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { SPECIALTY_OPTIONS } from 'land/constants';
import { toggleArrayItem } from 'land/utils/toggle-array-item';

function formFrom(vendor, defaultRegionCode) {
  if (!vendor) {
    return {
      formName: '',
      formEmail: '',
      formPhone: '',
      formSpecialties: [],
      formCompanyName: '',
      formAddress: '',
      formHourlyRate: '',
      formRating: '',
      formNotes: '',
      formRegionCode: defaultRegionCode,
    };
  }
  return {
    formName: vendor.name ?? '',
    formEmail: vendor.email ?? '',
    formPhone: vendor.phone ?? '',
    formSpecialties: Array.isArray(vendor.specialties)
      ? [...vendor.specialties]
      : [],
    formCompanyName: vendor.companyName ?? '',
    formAddress: vendor.address ?? '',
    formHourlyRate: vendor.hourlyRate ? String(vendor.hourlyRate) : '',
    formRating: vendor.rating ? String(vendor.rating) : '',
    formNotes: vendor.notes ?? '',
    formRegionCode: vendor.regionCode ?? '',
  };
}

// No @vendor means create.
export default class VendorsVendorDrawerComponent extends Component {
  @service auth;
  @service notifications;
  @service region;

  @tracked draft = null;
  @tracked isSaving = false;
  @tracked error = null;

  draftFor = null;
  specialtyOptions = SPECIALTY_OPTIONS;

  // Draft and error are keyed to the record they were made for.
  get source() {
    return this.args.vendor?.id ?? 'new';
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return formFrom(this.args.vendor, this.region.regionCode);
  }

  get isEdit() {
    return Boolean(this.args.vendor);
  }

  get errorMsg() {
    return this.error?.source === this.source ? this.error.message : '';
  }

  get submitLabel() {
    if (this.isSaving) return 'Saving...';
    return this.isEdit ? 'Update' : 'Create Vendor';
  }

  get showRegionField() {
    return this.region.regions.length > 1;
  }

  get regionOptions() {
    return this.region.regionOptions;
  }

  @action setField(name, value) {
    this.draftFor = this.source;
    this.draft = { ...this.form, [name]: value };
  }

  @action toggleSpecialty(value) {
    this.setField(
      'formSpecialties',
      toggleArrayItem(this.form.formSpecialties, value),
    );
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

    const form = this.form;
    const source = this.source;
    if (!form.formSpecialties.length) {
      this.error = { source, message: 'Select at least one specialty.' };
      return;
    }
    this.isSaving = true;
    this.error = null;

    const isEdit = this.isEdit;
    const path = isEdit ? `/vendors/${this.args.vendor.id}` : '/vendors';

    const body = {
      name: form.formName,
      specialties: form.formSpecialties,
      ...(form.formEmail ? { email: form.formEmail } : {}),
      ...(form.formPhone ? { phone: form.formPhone } : {}),
      ...(form.formCompanyName ? { companyName: form.formCompanyName } : {}),
      ...(form.formAddress ? { address: form.formAddress } : {}),
      ...(form.formHourlyRate
        ? { hourlyRate: parseFloat(form.formHourlyRate) }
        : {}),
      ...(form.formRating ? { rating: parseInt(form.formRating, 10) } : {}),
      ...(form.formNotes ? { notes: form.formNotes } : {}),
      ...(!isEdit && form.formRegionCode
        ? { regionCode: form.formRegionCode }
        : {}),
    };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Vendor updated' : 'Vendor created');
      this.close();
      this.args.onSaved?.();
    } catch (e) {
      this.error = { source, message: e.message };
    } finally {
      this.isSaving = false;
    }
  }
}
