import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class ProfileController extends Controller {
  @service auth;
  @service notifications;
  @service router;
  @service googleAuth;

  @tracked formName = '';
  @tracked formPassword = '';
  @tracked isSaving = false;
  @tracked isLinkingGoogle = false;
  @tracked errorMsg = '';

  get user() {
    return this.model;
  }

  get isGoogleLinked() {
    return Boolean(this.user?.googleId);
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action async saveProfile(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    try {
      const body = {
        name: this.formName || this.user.name,
      };

      if (this.formPassword) {
        body.password = this.formPassword;
      }

      await this.auth.fetchJson('/users/me', {
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

  @action
  async renderGoogleLinkButton(element) {
    if (this.isGoogleLinked) return;

    if (window.google?.accounts?.id) {
      window.google.accounts.id.cancel();
    }

    try {
      await this.googleAuth.renderButton(element, (idToken) => this.linkGoogleAccount(idToken));
    } catch (err) {
      if (!this.errorMsg) {
        this.errorMsg = err.message || 'Failed to load Google button';
      }
    }
  }

  async linkGoogleAccount(idToken) {
    if (this.isLinkingGoogle) return;

    this.isLinkingGoogle = true;
    this.errorMsg = '';

    try {
      await this.auth.linkGoogleAccount(idToken);
      this.notifications.success('Google account linked');
      this.router.refresh('profile');
    } catch (e) {
      this.errorMsg = e.message || 'Unable to link Google account';
    } finally {
      this.isLinkingGoogle = false;
    }
  }
}
