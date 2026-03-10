import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class ProfileController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked formName = '';
  @tracked formEmail = '';
  @tracked formPassword = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';

  get user() {
    return this.model;
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action async saveProfile(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const userId = this.auth.currentUser?.id;

    try {
      const body = {
        name: this.formName,
        email: this.formEmail,
      };

      if (this.formPassword) {
        body.password = this.formPassword;
      }

      await this.auth.fetchJson(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      this.notifications.success('Profile updated');
      this.router.refresh('profile');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
