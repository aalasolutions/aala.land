import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const SPECIALTY_OPTIONS = [
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'HVAC', label: 'HVAC' },
  { value: 'STRUCTURAL', label: 'Structural' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'PEST_CONTROL', label: 'Pest Control' },
  { value: 'APPLIANCE', label: 'Appliance' },
  { value: 'PAINTING', label: 'Painting' },
  { value: 'GENERAL', label: 'General' },
];

export default class VendorsController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked showModal = false;
  @tracked editVendor = null;
  @tracked formName = '';
  @tracked formEmail = '';
  @tracked formPhone = '';
  @tracked formSpecialty = 'GENERAL';
  @tracked formCompanyName = '';
  @tracked formAddress = '';
  @tracked formHourlyRate = '';
  @tracked formRating = '';
  @tracked formNotes = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';

  get specialtyOptions() {
    return SPECIALTY_OPTIONS;
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action openCreate() {
    this.formName = '';
    this.formEmail = '';
    this.formPhone = '';
    this.formSpecialty = 'GENERAL';
    this.formCompanyName = '';
    this.formAddress = '';
    this.formHourlyRate = '';
    this.formRating = '';
    this.formNotes = '';
    this.editVendor = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(vendor) {
    this.formName = vendor.name ?? '';
    this.formEmail = vendor.email ?? '';
    this.formPhone = vendor.phone ?? '';
    this.formSpecialty = vendor.specialty ?? 'GENERAL';
    this.formCompanyName = vendor.companyName ?? '';
    this.formAddress = vendor.address ?? '';
    this.formHourlyRate = vendor.hourlyRate ? String(vendor.hourlyRate) : '';
    this.formRating = vendor.rating ? String(vendor.rating) : '';
    this.formNotes = vendor.notes ?? '';
    this.editVendor = vendor;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editVendor = null;
    this.errorMsg = '';
  }

  @action async saveVendor(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editVendor;
    const path = isEdit ? `/vendors/${this.editVendor.id}` : '/vendors';

    const body = {
      name: this.formName,
      specialty: this.formSpecialty,
      ...(this.formEmail ? { email: this.formEmail } : {}),
      ...(this.formPhone ? { phone: this.formPhone } : {}),
      ...(this.formCompanyName ? { companyName: this.formCompanyName } : {}),
      ...(this.formAddress ? { address: this.formAddress } : {}),
      ...(this.formHourlyRate ? { hourlyRate: parseFloat(this.formHourlyRate) } : {}),
      ...(this.formRating ? { rating: parseInt(this.formRating, 10) } : {}),
      ...(this.formNotes ? { notes: this.formNotes } : {}),
    };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Vendor updated' : 'Vendor created');
      this.closeModal();
      this.router.refresh('vendors');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  @action async deleteVendor(vendor) {
    if (!confirm(`Delete vendor ${vendor.name}?`)) return;

    try {
      await this.auth.fetchJson(`/vendors/${vendor.id}`, { method: 'DELETE' });
      this.notifications.success('Vendor deleted');
      this.router.refresh('vendors');
    } catch (e) {
      this.notifications.error(e.message);
    }
  }
}
