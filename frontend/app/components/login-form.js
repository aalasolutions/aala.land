import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class LoginFormComponent extends Component {
  @service auth;
  @service router;
  @service notifications;

  @tracked email = '';
  @tracked password = '';
  @tracked isLoading = false;
  @tracked errorMessage = '';

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
}
