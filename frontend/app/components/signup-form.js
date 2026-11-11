import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class SignupFormComponent extends Component {
  @service auth;
  @service router;
  @service googleAuth;

  @tracked userName = '';
  @tracked email = '';
  @tracked password = '';
  @tracked confirmPassword = '';
  @tracked isLoading = false;
  @tracked isGoogleLoading = false;
  @tracked errorMessage = '';
  @tracked fieldErrors = {};

  validate() {
    const errors = {};
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
      this.userName.trim() &&
      this.email.trim() &&
      this.password.length >= 8 &&
      this.password === this.confirmPassword,
    );
  }

  @action
  updateField(field, value) {
    this[field] = value;
    this.errorMessage = '';
    this.dropFieldErrors(field);
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
        userName: this.userName.trim(),
        email: this.email.trim(),
        password: this.password,
        // First-touch marketer attribution from ?ref= (undefined drops from JSON)
        marketerCode: this.args.marketerCode || undefined,
      });

      this.router.transitionTo('onboarding');
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

  async signupWithGoogle(idToken) {
    this.isGoogleLoading = true;
    this.errorMessage = '';

    try {
      await this.auth.signupWithGoogle({
        idToken,
        marketerCode: this.args.marketerCode || undefined,
      });
      this.router.transitionTo('onboarding');
    } catch (err) {
      this.errorMessage =
        err.message || 'Google signup failed. Please try again.';
    } finally {
      this.isGoogleLoading = false;
    }
  }
}
