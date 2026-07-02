import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class LoginFormComponent extends Component {
  @service auth;
  @service router;
  @service googleAuth;

  @tracked email = '';
  @tracked password = '';
  @tracked isLoading = false;
  @tracked errorMessage = '';

  @tracked showForgotPassword = false;
  @tracked resetEmail = '';
  @tracked resetSent = false;
  @tracked resetLoading = false;
  @tracked resetError = '';

  @tracked isGoogleLoading = false;

  @action
  updateEmail(event) {
    this.email = event.target.value;
    this.errorMessage = '';
  }

  @action
  updatePassword(event) {
    this.password = event.target.value;
    this.errorMessage = '';
  }

  @action
  async submit(event) {
    event.preventDefault();
    if (this.isLoading) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      await this.auth.login(this.email, this.password);
      this.router.transitionTo('dashboard');
    } catch (err) {
      this.errorMessage = err.message ?? 'Login failed. Check your credentials.';
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
      await this.googleAuth.renderButton(element, (idToken) => this.loginWithGoogle(idToken));
    } catch (err) {
      this.errorMessage = err.message || 'Failed to load Google Sign-in button';
    }
  }

  async loginWithGoogle(idToken) {
    this.isGoogleLoading = true;

    try {
      await this.auth.loginWithGoogle(idToken);
      this.router.transitionTo('dashboard');
    } catch (err) {
      this.errorMessage = err.message || 'Google sign-in failed. Please try again.';
    } finally {
      this.isGoogleLoading = false;
    }
  }

  @action
  toggleForgotPassword() {
    this.showForgotPassword = !this.showForgotPassword;
    this.resetEmail = '';
    this.resetSent = false;
    this.resetError = '';
  }

  @action
  updateResetEmail(event) {
    this.resetEmail = event.target.value;
    this.resetError = '';
  }

  @action
  async submitForgotPassword(event) {
    event.preventDefault();
    if (this.resetLoading) return;
    this.resetLoading = true;
    this.resetError = '';
    try {
      await this.auth.requestPasswordReset(this.resetEmail);
      this.resetSent = true;
    } catch (err) {
      this.resetError = err.message || 'Something went wrong. Please try again.';
    } finally {
      this.resetLoading = false;
    }
  }
}
