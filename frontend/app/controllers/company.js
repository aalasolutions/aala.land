import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { isAdminRole } from '../utils/roles';

export default class CompanyController extends Controller {
  @service auth;
  @service notifications;
  @service router;
  @service region;
  @service session;

  @tracked formName = '';
  @tracked formActiveRegions = [];
  @tracked formDefaultRegionCode = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked expandedCountries = [];

  @action toggleCountry(countryCode) {
    if (this.expandedCountries.includes(countryCode)) {
      this.expandedCountries = this.expandedCountries.filter(c => c !== countryCode);
    } else {
      this.expandedCountries = [...this.expandedCountries, countryCode];
    }
  }

  @action selectedCountInGroup(regions) {
    return regions.filter(r => this.formActiveRegions.includes(r.code)).length;
  }

  get company() {
    return this.model?.company;
  }

  get isPaid() {
    const tier = this.company?.subscriptionTier;
    return tier && tier !== 'FREE';
  }

  get isAdmin() {
    return isAdminRole(this.auth.currentUser?.role);
  }

  get maxCountries() {
    const limits = { FREE: 1, STARTER: 1, GROWTH: 2, SCALE: 999, ENTERPRISE: 999 };
    return limits[this.company?.subscriptionTier] || 1;
  }

  get selectedCountries() {
    const regions = this.model?.regions || [];
    const countries = new Set();
    for (const code of this.formActiveRegions) {
      const r = regions.find(reg => reg.code === code);
      if (r) countries.add(r.country);
    }
    return [...countries];
  }

  get canAddMoreCountries() {
    return this.selectedCountries.length < this.maxCountries;
  }

  get activeRegionObjects() {
    const regions = this.model?.regions || [];
    return regions.filter((r) => this.formActiveRegions.includes(r.code));
  }

  get activeRegionOptions() {
    return this.activeRegionObjects.map(r => ({
      value: r.code,
      label: `${r.name} (${r.currency})`
    }));
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action toggleRegion(code) {
    if (!this.isAdmin) return;

    if (this.formActiveRegions.includes(code)) {
      this.formActiveRegions = this.formActiveRegions.filter((c) => c !== code);
      if (this.formDefaultRegionCode === code) {
        this.formDefaultRegionCode = this.formActiveRegions[0] || '';
      }
    } else {
      const regions = this.model?.regions || [];
      const regionObj = regions.find(r => r.code === code);
      const regionCountry = regionObj?.country;

      if (!this.selectedCountries.includes(regionCountry) && !this.canAddMoreCountries) {
        this.notifications.error(`Your ${this.company?.subscriptionTier || 'FREE'} plan allows ${this.maxCountries} country. Upgrade to add more.`);
        return;
      }

      this.formActiveRegions = [...this.formActiveRegions, code];
      if (this.formActiveRegions.length === 1) {
        this.formDefaultRegionCode = code;
      }
    }
  }

  @action async saveCompany(event) {
    event.preventDefault();
    if (!this.isAdmin) {
      this.errorMsg = 'Only company admins can update company settings.';
      return;
    }

    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const companyId = this.auth.currentUser?.companyId;

    try {
      await this.auth.fetchJson(`/companies/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: this.formName,
          ...(this.formActiveRegions.length > 0 ? {
            activeRegions: this.formActiveRegions,
            defaultRegionCode: this.formDefaultRegionCode,
          } : {}),
        }),
      });

      // Re-initialize region service with updated active regions
      const allRegions = this.model?.regions || [];
      const newActiveRegions = allRegions.filter((r) => this.formActiveRegions.includes(r.code));
      this.region.initialize(newActiveRegions, this.formDefaultRegionCode);

      // Persist to session storage so hard reload keeps the new regions
      this.session.data.authenticated.regions = newActiveRegions;
      this.session.data.authenticated.defaultRegionCode = this.formDefaultRegionCode;
      this.session.saveToStorage();

      this.notifications.success('Company updated');
      this.router.refresh('company');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
