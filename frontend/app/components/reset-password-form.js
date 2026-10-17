import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class ResetPasswordFormComponent extends Component {
  @service auth;

  @tracked password = '';
  @tracked confirmPassword = '';
  @tracked isLoading = false;
  @tracked isSuccess = false;
  @tracked errorMessage = '';
  @tracked fieldErrors = {};

  get token() {
    return this.args.token ?? '';
  }

  get hasToken() {
    return Boolean(this.token.trim());
  }

  get canSubmit() {
    return (
      this.hasToken &&
      this.password.length > 0 &&
      this.confirmPassword.length > 0
    );
  }

  @action
  updateField(field, value) {
    this[field] = value;
    this.errorMessage = '';
    if (field in this.fieldErrors) {
      const errors = { ...this.fieldErrors };
      delete errors[field];
      this.fieldErrors = errors;
    }
  }

  @action
  async submit(event) {
    event.preventDefault();

    if (this.isLoading) return;

    if (!this.hasToken) {
      this.errorMessage = 'Reset link is invalid or incomplete.';
      return;
    }

    const errors = {};
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
    this.fieldErrors = errors;
    if (Object.keys(errors).length) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      await this.auth.resetPassword({
        token: this.token.trim(),
        newPassword: this.password,
      });
      this.isSuccess = true;
      this.password = '';
      this.confirmPassword = '';
    } catch (err) {
      this.errorMessage =
        err.message || 'Unable to reset password. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
