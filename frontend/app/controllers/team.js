import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { closeDeleteModal, confirmDeleteModal, openDeleteModal } from '../utils/delete-modal';

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

  queryParams = ['page', 'limit'];
  @tracked page = 1;
  @tracked limit = 10;

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

  roles = ROLES;

  get totalPages() {
    const total = this.model?.total ?? 0;
    return Math.max(1, Math.ceil(total / this.limit));
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action setLimit(e) {
    this.limit = Number(e.target.value) || 10;
    this.page = 1;
  }

  @action goToPreviousPage() {
    const page = Number(this.page) || 1;
    if (page <= 1) return;
    this.page = page - 1;
  }

  @action goToNextPage() {
    const page = Number(this.page) || 1;
    if (page >= this.totalPages) return;
    this.page = page + 1;
  }

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
    openDeleteModal(this, 'userToDelete', user);
  }

  @action closeDeleteModal() {
    closeDeleteModal(this, 'userToDelete');
  }

  @action async confirmDelete() {
    await confirmDeleteModal(this, {
      itemKey: 'userToDelete',
      resourcePath: '/users',
      successMessage: 'Team member removed',
      refreshRoute: 'team',
    });
  }
}
