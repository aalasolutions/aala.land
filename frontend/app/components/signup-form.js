import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class SignupFormComponent extends Component {
  @service auth;
  @service router;
  @service googleAuth;

  @tracked companyName = '';
  @tracked companySlug = '';
  @tracked userName = '';
  @tracked email = '';
  @tracked password = '';
  @tracked confirmPassword = '';
  @tracked selectedRegion = '';
  @tracked isLoading = false;
  @tracked isGoogleLoading = false;
  @tracked errorMessage = '';
  @tracked fieldErrors = {};

  get regionOptions() {
    return (this.args.grouped || []).flatMap((group) =>
      (group.regions || []).map((r) => ({
        value: r.code,
        label: `${r.name} (${r.currency})`,
        group: group.countryName,
      })),
    );
  }

  validate() {
    const errors = {};
    if (!this.companyName.trim()) {
      errors.companyName = 'Enter a company name';
    } else if (!this.companySlug.trim()) {
      errors.companyName = 'Use letters or numbers in the company name';
    }
    if (!this.companySlug.trim())
      errors.companySlug = 'Enter a company URL slug';
    if (!this.selectedRegion) errors.region = 'Choose a region';
    if (!this.userName.trim()) errors.userName = 'Enter your name';
    if (!this.email.trim()) errors.email = 'Enter your email address';
    if (!this.password) {
      errors.password = 'Enter a password';
    } else if (this.password.length < 8) {
      errors.password = 'Use at least 8 characters';
    }
    if (!this.confirmPassword) {
      errors.confirmPassword = 'Confirm your password';
    } else if (this.password !== this.confirmPassword) {
      errors.confirmPassword = 'Re-enter the same password';
    }
    return errors;
  }

  dropFieldErrors(...names) {
    if (!names.some((name) => name in this.fieldErrors)) return;
    const errors = { ...this.fieldErrors };
    names.forEach((name) => delete errors[name]);
    this.fieldErrors = errors;
  }

  get canSubmit() {
    return Boolean(
      this.companyName.trim() &&
      this.companySlug.trim() &&
      this.userName.trim() &&
      this.email.trim() &&
      this.password.length >= 8 &&
      this.password === this.confirmPassword &&
      this.selectedRegion,
    );
  }

  get canGoogleSignup() {
    return Boolean(this.companyName.trim() && this.selectedRegion);
  }

  @action
  updateField(field, value) {
    this[field] = value;
    this.errorMessage = '';
    this.dropFieldErrors(field);

    if (field === 'companyName') {
      this.companySlug = value
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
    this.dropFieldErrors('region');
  }

  @action
  async submit(event) {
    event.preventDefault();

    if (this.isLoading) return;

    const errors = this.validate();
    this.fieldErrors = errors;
    if (Object.keys(errors).length) {
      this.errorMessage = '';
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
        // First-touch marketer attribution from ?ref= (undefined drops from JSON)
        marketerCode: this.args.marketerCode || undefined,
      });

      this.router.transitionTo('dashboard');
    } catch (err) {
      this.errorMessage =
        err.message || 'Something went wrong. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async renderGoogleButton(element) {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.cancel();
    }

    try {
      await this.googleAuth.renderButton(element, (idToken) =>
        this.signupWithGoogle(idToken),
      );
    } catch (err) {
      if (!this.errorMessage) {
        this.errorMessage =
          err.message || 'Failed to load Google Sign-in button';
      }
    }
  }

  @action
  showGoogleSignupRequirements() {
    if (!this.companyName.trim() && !this.selectedRegion) {
      this.errorMessage =
        'Company name and region are required for Google signup';
    } else if (!this.companyName.trim()) {
      this.errorMessage = 'Company name is required for Google signup';
    } else {
      this.errorMessage = 'Please select a region for Google signup';
    }
  }

  async signupWithGoogle(idToken) {
    if (!this.canGoogleSignup) {
      this.errorMessage =
        'Company name and region are required for Google signup';
      return;
    }

    this.isGoogleLoading = true;
    this.errorMessage = '';

    try {
      await this.auth.signupWithGoogle({
        idToken,
        companyName: this.companyName.trim(),
        regionCode: this.selectedRegion,
        marketerCode: this.args.marketerCode || undefined,
      });
      this.router.transitionTo('dashboard');
    } catch (err) {
      this.errorMessage =
        err.message || 'Google signup failed. Please try again.';
    } finally {
      this.isGoogleLoading = false;
    }
  }
}
