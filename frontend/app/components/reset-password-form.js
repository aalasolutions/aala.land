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

  get token() {
    return this.args.token ?? '';
  }

  get hasToken() {
    return Boolean(this.token.trim());
  }

  get canSubmit() {
    return this.hasToken && this.password.length > 0 && this.confirmPassword.length > 0;
  }

  @action
  updateField(field, event) {
    this[field] = event.target.value;
    this.errorMessage = '';
  }

  @action
  async submit(event) {
    event.preventDefault();

    if (this.isLoading) return;

    if (!this.hasToken) {
      this.errorMessage = 'Reset link is invalid or incomplete.';
      return;
    }

    if (this.password.length < 8) {
      this.errorMessage = 'Password must be at least 8 characters.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

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
      this.errorMessage = err.message || 'Unable to reset password. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
