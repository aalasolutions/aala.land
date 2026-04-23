import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import config from 'frontend/config/environment';

export default class AcceptInviteController extends Controller {
  queryParams = ['token'];

  @service router;
  @service notifications;

  @tracked token = null;
  @tracked password = '';
  @tracked confirmPassword = '';
  @tracked isSubmitting = false;
  @tracked errorMsg = '';
  @tracked done = false;

  @action setField(field, e) {
    this[field] = e.target.value;
  }

  @action async submit(event) {
    event.preventDefault();
    this.errorMsg = '';

    if (this.password.length < 8) {
      this.errorMsg = 'Password must be at least 8 characters.';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMsg = 'Passwords do not match.';
      return;
    }

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
