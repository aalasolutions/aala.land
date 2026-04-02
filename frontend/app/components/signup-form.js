import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import config from 'frontend/config/environment';

export default class SignupFormComponent extends Component {
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
  selectRegion(code) {
    this.selectedRegion = code;
    this.errorMessage = '';
  }

  @action
  async submit(event) {
    event.preventDefault();
    if (this.isLoading || !this.canSubmit) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const response = await fetch(`${config.APP.API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: this.companyName.trim(),
          companySlug: this.companySlug.trim(),
          defaultRegionCode: this.selectedRegion,
          userName: this.userName.trim(),
          email: this.email.trim(),
          password: this.password,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = Array.isArray(err.message)
          ? err.message.join(', ')
          : (err.message || 'Registration failed');
        throw new Error(msg);
      }

      const { data } = await response.json();

      // Auto-login: store session
      localStorage.setItem('aala-session', JSON.stringify({
        data: {
          authenticated: {
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            regions: data.regions || [],
            defaultRegionCode: data.defaultRegionCode || null,
          },
        },
        isAuthenticated: true,
      }));

      this.router.transitionTo('dashboard');
    } catch (err) {
      this.errorMessage = err.message || 'Something went wrong. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
