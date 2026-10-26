import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import config from 'land/config/environment';

export default class AcceptInviteController extends Controller {
  queryParams = ['token'];

  @service router;
  @service notifications;

  @tracked token = null;
  @tracked password = '';
  @tracked confirmPassword = '';
  @tracked isSubmitting = false;
  @tracked errorMsg = '';
  @tracked fieldErrors = {};
  @tracked done = false;

  @action setField(field, e) {
    this[field] = e.target.value;
  }

  // Woven::Input calls onInput as (value, event), not with a raw DOM event.
  @action setFieldValue(field, value) {
    this[field] = value;
    if (field in this.fieldErrors) {
      const errors = { ...this.fieldErrors };
      delete errors[field];
      this.fieldErrors = errors;
    }
  }

  @action async submit(event) {
    event.preventDefault();
    this.errorMsg = '';

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

    this.isSubmitting = true;
    try {
      const res = await fetch(`${config.APP.API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token, newPassword: this.password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Failed to set password.');
      }

      this.done = true;
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSubmitting = false;
    }
  }

  @action goToLogin() {
    this.router.transitionTo('login');
  }
}
