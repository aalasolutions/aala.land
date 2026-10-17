import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { assignableRoles } from 'land/utils/roles';

const EMPTY_FORM = {
  inviteFirstName: '',
  inviteLastName: '',
  inviteEmail: '',
  inviteRole: 'agent',
};

// @onReactivate(user) resolves true when the user was reactivated.
export default class TeamInviteDrawerComponent extends Component {
  @service auth;
  @service notifications;

  @tracked draft = null;
  @tracked isInviting = false;
  @tracked errorMsg = '';
  @tracked existingUser = null;
  @tracked fieldErrors = {};

  get form() {
    return this.draft ?? EMPTY_FORM;
  }

  get roles() {
    return assignableRoles(this.auth.currentUser?.role);
  }

  @action setField(name, value) {
    this.draft = { ...this.form, [name]: value };
    if (name in this.fieldErrors) {
      const errors = { ...this.fieldErrors };
      delete errors[name];
      this.fieldErrors = errors;
    }
  }

  validate(form) {
    const errors = {};
    if (!form.inviteFirstName.trim()) {
      errors.inviteFirstName = 'Enter a first name';
    }
    if (!form.inviteLastName.trim()) {
      errors.inviteLastName = 'Enter a last name';
    }
    if (!form.inviteEmail.trim()) errors.inviteEmail = 'Enter an email';
    return errors;
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.errorMsg = '';
    this.existingUser = null;
    this.fieldErrors = {};
    this.args.onClosed?.();
  }

  @action async send(event) {
    event.preventDefault();
    if (this.isInviting || this.args.isReactivating) return;

    const form = this.form;
    const errors = this.validate(form);
    if (Object.keys(errors).length > 0) {
      this.errorMsg = '';
      this.existingUser = null;
      this.fieldErrors = errors;
      return;
    }

    this.isInviting = true;
    this.errorMsg = '';
    this.existingUser = null;
    this.fieldErrors = {};
    try {
      await this.auth.fetchJson('/users/invite', {
        method: 'POST',
        body: JSON.stringify({
          email: form.inviteEmail,
          firstName: form.inviteFirstName,
          lastName: form.inviteLastName,
          role: form.inviteRole,
        }),
      });
      this.notifications.success('Invitation sent successfully');
      this.close();
      this.args.onSaved?.();
    } catch (e) {
      this.errorMsg = e.message;
      this.existingUser =
        e.body?.code === 'EMAIL_INACTIVE_USER'
          ? { id: e.body.existingUserId, name: e.body.existingUserName }
          : null;
    } finally {
      this.isInviting = false;
    }
  }

  @action async reactivateExisting() {
    if (!this.existingUser || this.args.isReactivating) return;
    const reactivated = await this.args.onReactivate?.(this.existingUser);
    if (reactivated) this.close();
  }
}
