import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { ROLE_HIERARCHY } from '../utils/roles';

const ALL_ROLES = [
  { value: 'company_admin', label: 'Company Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
  { value: 'accountant', label: 'Accountant' },
];

export default class TeamController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit'];
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
  @tracked impersonatingUserId = null;

  // Remove flow (deactivate or delete, double-confirm)
  @tracked showRemoveModal = false;
  @tracked removeStep = 1;
  @tracked userToRemove = null;
  @tracked removeMode = 'deactivate';
  @tracked removeTargetId = '';
  @tracked removeReason = '';
  @tracked removeError = '';
  @tracked isRemoving = false;
  @tracked reassignCandidates = [];

  // Trim-to-one flow (downgrade preparation, double-confirm)
  @tracked showTrimModal = false;
  @tracked trimStep = 1;
  @tracked trimKeepId = '';
  @tracked trimReason = '';
  @tracked trimError = '';
  @tracked isTrimming = false;
  @tracked trimCandidates = [];

  @tracked reactivatingUserId = null;

  get isSuperAdmin() {
    return this.auth.currentUser?.role === 'super_admin';
  }

  get isImpersonating() {
    return this.auth.isImpersonating;
  }

  // Any reactivation in flight. The handler blocks concurrent reactivations, so every
  // Reactivate button is disabled while one runs (not just the clicked row).
  get isReactivating() {
    return !!this.reactivatingUserId;
  }

  get roles() {
    const myRole = this.auth.currentUser?.role;
    const myLevel = ROLE_HIERARCHY.indexOf(myRole);
    if (myLevel === -1) return [];
    return ALL_ROLES.filter((r) => ROLE_HIERARCHY.indexOf(r.value) > myLevel);
  }

  get canTrim() {
    // Trim exists to prepare a paid -> Free downgrade, so it is meaningless on
    // Free. Only hide the button when we positively know the tier is FREE; if
    // seatInfo failed to load we still show it (the server enforces the gate).
    return (
      this.auth.currentUser?.role === 'company_admin' &&
      (this.model?.total ?? 0) > 1 &&
      this.model?.seatInfo?.tier !== 'FREE'
    );
  }

  get reassignOptions() {
    return this.reassignCandidates.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }));
  }

  get removeTargetName() {
    return this.reassignCandidates.find((u) => u.id === this.removeTargetId)?.name ?? '';
  }

  get trimKeepOptions() {
    return this.trimCandidates
      .filter((u) => u.role === 'company_admin')
      .map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }));
  }

  get trimKeepName() {
    return this.trimCandidates.find((u) => u.id === this.trimKeepId)?.name ?? '';
  }

  get trimOthersCount() {
    return this.trimCandidates.filter((u) => u.id !== this.trimKeepId).length;
  }

  get trimKeeperIsNotMe() {
    return this.trimKeepId && this.trimKeepId !== this.auth.currentUser?.id;
  }

  async loadActiveUsers({ excludeId = null, companyId = null } = {}) {
    // The server scopes to active, non-super-admin members of the company (and caps the
    // list), so the pickers can't miss a valid candidate the way a client-side filter
    // over a single /users page could. Only the removed user is excluded here.
    const path = companyId
      ? `/users/active-members?companyId=${encodeURIComponent(companyId)}`
      : '/users/active-members';
    const json = await this.auth.fetchJson(path);
    const users = json.data || [];
    return excludeId ? users.filter((u) => u.id !== excludeId) : users;
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

  // ---- Remove flow ----

  @action async openRemove(user) {
    this.userToRemove = user;
    this.removeStep = 1;
    // Inactive users can only be deleted; deactivate would 400 ("already inactive").
    this.removeMode = user?.isActive ? 'deactivate' : 'delete';
    this.removeTargetId = '';
    this.removeReason = '';
    this.removeError = '';
    this.reassignCandidates = [];
    this.showRemoveModal = true;
    try {
      this.reassignCandidates = await this.loadActiveUsers({
        excludeId: user.id,
        companyId: user.companyId ?? null,
      });
      if (this.reassignCandidates.length === 0) {
        this.removeError = 'No other active user is available to receive this member’s records.';
      }
    } catch (e) {
      this.removeError = e.message;
    }
  }

  @action closeRemoveModal() {
    this.showRemoveModal = false;
    this.userToRemove = null;
    this.removeError = '';
  }

  @action setRemoveMode(mode) {
    this.removeMode = mode;
  }

  @action continueRemove() {
    if (!this.removeTargetId) {
      this.removeError = 'Choose who receives the records.';
      return;
    }
    if (!this.removeReason.trim()) {
      this.removeError = 'A reason is required.';
      return;
    }
    this.removeError = '';
    this.removeStep = 2;
  }

  @action backToRemoveOptions() {
    this.removeStep = 1;
  }

  @action async confirmRemove() {
    if (this.isRemoving || !this.userToRemove) return;
    this.isRemoving = true;
    this.removeError = '';

    const body = JSON.stringify({
      reassignToUserId: this.removeTargetId,
      reason: this.removeReason.trim(),
    });
    const isDelete = this.removeMode === 'delete';
    const path = isDelete
      ? `/users/${this.userToRemove.id}/delete`
      : `/users/${this.userToRemove.id}/deactivate`;

    try {
      const json = await this.auth.fetchJson(path, {
        method: 'POST',
        body,
      });
      const report = json?.data;
      const moved = (report?.entities || []).reduce((sum, e) => sum + e.count, 0);
      this.notifications.success(
        `${this.userToRemove.name} ${isDelete ? 'deleted' : 'deactivated'}. ${moved} record${moved === 1 ? '' : 's'} reassigned.`,
      );
      this.closeRemoveModal();
      this.router.refresh('team');
    } catch (e) {
      this.removeError = e.message;
    } finally {
      this.isRemoving = false;
    }
  }

  @action async reactivateUser(user) {
    if (this.reactivatingUserId) return;
    this.reactivatingUserId = user.id;
    try {
      await this.auth.fetchJson(`/users/${user.id}/reactivate`, { method: 'POST' });
      this.notifications.success(`${user.name} reactivated`);
      this.router.refresh('team');
    } catch (e) {
      this.notifications.error(e.message || 'Reactivation failed');
    } finally {
      this.reactivatingUserId = null;
    }
  }

  // ---- Trim flow ----

  @action async openTrim() {
    this.trimStep = 1;
    this.trimKeepId = this.auth.currentUser?.id ?? '';
    this.trimReason = 'Downgrading to the Free plan';
    this.trimError = '';
    this.trimCandidates = [];
    this.showTrimModal = true;
    try {
      this.trimCandidates = await this.loadActiveUsers();
    } catch (e) {
      this.trimError = e.message;
    }
  }

  @action closeTrimModal() {
    this.showTrimModal = false;
    this.trimError = '';
  }

  @action continueTrim() {
    if (!this.trimKeepId) {
      this.trimError = 'Choose the company admin who stays active.';
      return;
    }
    if (this.trimOthersCount === 0) {
      this.trimError = 'You already have only one active user. Nothing to trim.';
      return;
    }
    if (!this.trimReason.trim()) {
      this.trimError = 'A reason is required.';
      return;
    }
    this.trimError = '';
    this.trimStep = 2;
  }

  @action backToTrimOptions() {
    this.trimStep = 1;
  }

  @action async confirmTrim() {
    if (this.isTrimming) return;
    this.isTrimming = true;
    this.trimError = '';
    try {
      const json = await this.auth.fetchJson('/users/trim-to-one', {
        method: 'POST',
        body: JSON.stringify({
          keepUserId: this.trimKeepId,
          reason: this.trimReason.trim(),
        }),
      });
      const count = json?.data?.deactivatedCount ?? 0;
      this.notifications.success(
        `Team trimmed. ${count} member${count === 1 ? '' : 's'} deactivated; records moved to ${this.trimKeepName}.`,
      );
      this.closeTrimModal();
      this.router.refresh('team');
    } catch (e) {
      this.trimError = e.message;
    } finally {
      this.isTrimming = false;
    }
  }

  @action async impersonateUser(user) {
    if (this.impersonatingUserId) return;
    this.impersonatingUserId = user.id;
    try {
      await this.auth.impersonate(user.id);
    } catch (e) {
      this.notifications.error(e.message || 'Failed to impersonate user');
    } finally {
      this.impersonatingUserId = null;
    }
  }
}
