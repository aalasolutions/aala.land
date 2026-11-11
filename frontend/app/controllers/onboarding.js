import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { ROLES } from '../utils/roles';

export default class OnboardingController extends Controller {
  @service auth;
  @service session;
  @service router;

  @tracked step = 1;
  @tracked companyName = '';
  @tracked regionCode = '';
  @tracked isSaving = false;
  @tracked errorMessage = '';
  @tracked fieldErrors = {};

  get canComplete() {
    return this.auth.currentUser?.role === ROLES.COMPANY_ADMIN;
  }

  get isNameStep() {
    return this.step === 1;
  }

  get regionOptions() {
    return (this.model?.grouped || []).flatMap((group) =>
      (group.regions || []).map((r) => ({
        value: r.code,
        label: `${r.name} (${r.currency})`,
        group: group.countryName,
      })),
    );
  }

  reset() {
    this.step = 1;
    this.companyName = '';
    this.regionCode = '';
    this.isSaving = false;
    this.errorMessage = '';
    this.fieldErrors = {};
  }

  @action
  updateName(value) {
    this.companyName = value;
    this.errorMessage = '';
    this.fieldErrors = {};
  }

  @action
  selectRegion(code) {
    this.regionCode = code;
    this.errorMessage = '';
    this.fieldErrors = {};
  }

  @action
  nextStep(event) {
    event?.preventDefault();
    if (!this.companyName.trim()) {
      this.fieldErrors = { companyName: 'Enter a company name' };
      return;
    }
    this.fieldErrors = {};
    this.step = 2;
  }

  @action
  previousStep() {
    this.errorMessage = '';
    this.fieldErrors = {};
    this.step = 1;
  }

  @action
  async finish(event) {
    event?.preventDefault();
    if (this.isSaving) return;
    if (!this.regionCode) {
      this.fieldErrors = { region: 'Choose a region' };
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    try {
      await this.auth.fetchJson(
        `/companies/${this.auth.currentUser.companyId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: this.companyName.trim(),
            activeRegions: [this.regionCode],
            defaultRegionCode: this.regionCode,
          }),
        },
      );
      const { data } = await this.auth.fetchJson('/auth/profile');
      this.session.hydrate(data);
      this.router.transitionTo('dashboard');
    } catch (err) {
      this.errorMessage =
        err.message || 'Something went wrong. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }

  @action
  async logout() {
    await this.auth.logout();
    this.router.transitionTo('login');
  }
}
