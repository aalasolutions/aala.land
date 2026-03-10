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
  @tracked editUser = null;
  @tracked formName = '';
  @tracked formEmail = '';
  @tracked formPassword = '';
  @tracked formRole = 'agent';
  @tracked isSaving = false;
  @tracked errorMsg = '';

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
        email: this.formEmail,
        role: this.formRole,
      };
      if (!isEdit && this.formPassword) {
        body.password = this.formPassword;
      }

      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });

      this.notifications.success(isEdit ? 'Team member updated' : 'Team member invited');
      this.closeModal();
      this.router.refresh('team');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  @action async deleteUser(user) {
    if (!confirm(`Remove ${user.name}?`)) return;

    try {
      await this.auth.fetchJson(`/users/${user.id}`, { method: 'DELETE' });
      this.notifications.success('Team member removed');
      this.router.refresh('team');
    } catch (e) {
      this.notifications.error(e.message);
    }
  }
}
