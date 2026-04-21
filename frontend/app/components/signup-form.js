import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class SignupFormComponent extends Component {
  @service auth;
  @service router;

  @tracked companyName = '';
  @tracked companySlug = '';
  @tracked userName = '';
  @tracked email = '';
  @tracked password = '';
  @tracked confirmPassword = '';
  @tracked selectedRegion = '';
  @tracked isLoading = false;
  @tracked errorMessage = '';

  get regionOptions() {
    return (this.args.grouped || []).flatMap(group => 
      (group.regions || []).map(r => ({
        value: r.code,
        label: `${r.name} (${r.currency})`,
        group: group.countryName
      }))
    );
  }

  get canSubmit() {
    return (
      this.companyName.trim() &&
      this.companySlug.trim() &&
      this.userName.trim() &&
      this.email.trim() &&
      this.password.length >= 8 &&
      this.password === this.confirmPassword &&
      this.selectedRegion
    );
  }

  @action
  updateField(field, event) {
    this[field] = event.target.value;
    this.errorMessage = '';

    // Auto-generate slug from company name
    if (field === 'companyName') {
      this.companySlug = event.target.value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 100);
    }
  }

  @action
  selectRegion(event) {
    const code = event.target.value;
    this.selectedRegion = code;
    this.errorMessage = '';
  }

  @action
  async submit(event) {
    event.preventDefault();
    
    if (this.isLoading) return;
    
    if (!this.canSubmit) {
      if (!this.selectedRegion) this.errorMessage = 'Please select a region';
      else if (this.password !== this.confirmPassword) this.errorMessage = 'Passwords do not match';
      else if (this.password.length < 8) this.errorMessage = 'Password must be at least 8 characters';
      else this.errorMessage = 'Please fill in all fields';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      await this.auth.register({
        companyName: this.companyName.trim(),
        companySlug: this.companySlug.trim(),
        defaultRegionCode: this.selectedRegion,
        userName: this.userName.trim(),
        email: this.email.trim(),
        password: this.password,
      });

      this.router.transitionTo('dashboard');
    } catch (err) {
      this.errorMessage = err.message || 'Something went wrong. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
