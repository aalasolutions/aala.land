import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'company_admin', label: 'Company Admin' },
  { value: 'agent', label: 'Agent' },
  { value: 'viewer', label: 'Viewer' },
];

export default class TeamController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked showModal = false;
  @tracked showInviteModal = false;
  @tracked editUser = null;
  @tracked formName = '';
  @tracked formEmail = '';
  @tracked formPassword = '';
  @tracked formRole = 'agent';
  @tracked isSaving = false;
  @tracked errorMsg = '';

  @tracked inviteFirstName = '';
  @tracked inviteLastName = '';
  @tracked inviteEmail = '';
  @tracked inviteRole = 'agent';
  @tracked isInviting = false;
  @tracked inviteErrorMsg = '';
  @tracked showDeleteModal = false;
  @tracked userToDelete = null;
  @tracked isDeleting = false;

  get roles() {
    return ROLES;
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action openCreate() {
    this.formName = '';
    this.formEmail = '';
    this.formPassword = '';
    this.formRole = 'agent';
    this.editUser = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(user) {
    this.formName = user.name ?? '';
    this.formEmail = user.email ?? '';
    this.formPassword = '';
    this.formRole = user.role ?? 'agent';
    this.editUser = user;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editUser = null;
    this.errorMsg = '';
  }

  @action openInvite() {
    this.inviteFirstName = '';
    this.inviteLastName = '';
    this.inviteEmail = '';
    this.inviteRole = 'agent';
    this.inviteErrorMsg = '';
    this.showInviteModal = true;
  }

  @action closeInvite() {
    this.showInviteModal = false;
    this.inviteErrorMsg = '';
  }

  @action async sendInvite(event) {
    event.preventDefault();
    if (this.isInviting) return;
    this.isInviting = true;
    this.inviteErrorMsg = '';

    try {
      await this.auth.fetchJson('/users/invite', {
        method: 'POST',
        body: JSON.stringify({
          email: this.inviteEmail,
          firstName: this.inviteFirstName,
          lastName: this.inviteLastName,
          role: this.inviteRole,
        }),
      });
      this.notifications.success('Invitation sent successfully');
      this.closeInvite();
      this.router.refresh('team');
    } catch (e) {
      this.inviteErrorMsg = e.message;
    } finally {
      this.isInviting = false;
    }
  }

  @action async saveUser(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editUser;
    const path = isEdit ? `/users/${this.editUser.id}` : '/users';

    try {
      const body = {
        name: this.formName,
        role: this.formRole,
      };
      if (!isEdit) {
        body.email = this.formEmail;
        if (this.formPassword) body.password = this.formPassword;
      }

      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });

      this.notifications.success(isEdit ? 'Team member updated' : 'Team member created');
      this.closeModal();
      this.router.refresh('team');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  @action openDelete(user) {
    this.userToDelete = user;
    this.showDeleteModal = true;
  }

  @action closeDeleteModal() {
    this.showDeleteModal = false;
    this.userToDelete = null;
  }

  @action async confirmDelete() {
    if (!this.userToDelete || this.isDeleting) return;

    this.isDeleting = true;
    try {
      await this.auth.fetchJson(`/users/${this.userToDelete.id}`, { method: 'DELETE' });
      this.notifications.success('Team member removed');
      this.closeDeleteModal();
      this.router.refresh('team');
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.isDeleting = false;
    }
  }
}
