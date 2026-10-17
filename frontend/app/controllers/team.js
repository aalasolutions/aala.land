import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { toSeatInfo } from '../utils/seat-info';

export default class TeamController extends PaginatedController {
  @service auth;
  @service notifications;
  @service router;

  queryParams = ['page', 'limit'];
  @tracked showModal = false;
  @tracked showInviteModal = false;
  @tracked editUser = null;
  @tracked impersonatingUserId = null;

  @tracked showRemoveModal = false;
  @tracked removeStep = 1;
  @tracked userToRemove = null;
  @tracked removeMode = 'deactivate';
  @tracked removeTargetId = '';
  @tracked removeReason = '';
  @tracked removeError = '';
  @tracked removeReasonError = '';
  @tracked removeTargetError = '';
  @tracked isRemoving = false;
  @tracked reassignCandidates = [];

  @tracked showTrimModal = false;
  @tracked trimStep = 1;
  @tracked trimKeepId = '';
  @tracked trimReason = '';
  @tracked trimError = '';
  @tracked trimReasonError = '';
  @tracked trimKeepError = '';
  @tracked isTrimming = false;
  @tracked trimCandidates = [];

  @tracked refreshedSeatInfo = null;
  seatInfoToken = 0;

  @tracked reactivatingUserId = null;
  @tracked showReactivateModal = false;
  @tracked userToReactivate = null;
  @tracked reactivateReason = '';

  get isSuperAdmin() {
    return this.auth.currentUser?.role === 'super_admin';
  }

  // The Company column only exists for super admins.
  get columns() {
    return [
      { name: 'Name', valuePath: 'name', width: 200, isFixed: 'left' },
      { name: 'Email', valuePath: 'email', width: 240 },
      { name: 'Role', valuePath: 'role', width: 160 },
      { name: 'Regions', valuePath: 'regionCodes', width: 160 },
      ...(this.isSuperAdmin
        ? [{ name: 'Company', valuePath: 'company.name', width: 200 }]
        : []),
      { name: 'Status', valuePath: 'isActive', width: 120 },
      {
        name: 'Actions',
        valuePath: 'id',
        width: 160,
        isFixed: 'right',
        isSortable: false,
        isResizable: false,
      },
    ];
  }

  get isImpersonating() {
    return this.auth.isImpersonating;
  }

  // Blocks concurrent reactivations; all Reactivate buttons disable while one is running.
  get isReactivating() {
    return !!this.reactivatingUserId;
  }

  // Latest value fetched on open; falls back to the route's initial load.
  get seatInfo() {
    return this.refreshedSeatInfo ?? this.model?.seatInfo;
  }

  get canTrim() {
    // Hide only when tier is confirmed FREE; server still enforces the gate if seatInfo failed.
    return (
      this.auth.currentUser?.role === 'company_admin' &&
      (this.model?.total ?? 0) > 1 &&
      this.seatInfo?.tier !== 'FREE'
    );
  }

  get hasPaidSeats() {
    const seatInfo = this.seatInfo;
    return (
      !!seatInfo?.tier && seatInfo.tier !== 'FREE' && !!seatInfo.hasSubscription
    );
  }

  get reassignOptions() {
    return this.reassignCandidates.map((u) => ({
      value: u.id,
      label: `${u.name} (${u.email})`,
    }));
  }

  get removeTargetName() {
    return (
      this.reassignCandidates.find((u) => u.id === this.removeTargetId)?.name ??
      ''
    );
  }

  get trimKeepOptions() {
    return this.trimCandidates
      .filter((u) => u.role === 'company_admin')
      .map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }));
  }

  get trimKeepName() {
    return (
      this.trimCandidates.find((u) => u.id === this.trimKeepId)?.name ?? ''
    );
  }

  get trimOthersCount() {
    return this.trimCandidates.filter((u) => u.id !== this.trimKeepId).length;
  }

  get trimKeeperIsNotMe() {
    return this.trimKeepId && this.trimKeepId !== this.auth.currentUser?.id;
  }

  async loadActiveUsers({ excludeId = null, companyId = null } = {}) {
    // Server scopes to active company members so pickers can't miss a valid candidate.
    const path = companyId
      ? `/users/active-members?companyId=${encodeURIComponent(companyId)}`
      : '/users/active-members';
    const json = await this.auth.fetchJson(path);
    const users = json.data || [];
    return excludeId ? users.filter((u) => u.id !== excludeId) : users;
  }

  resetSeatInfo() {
    this.seatInfoToken++;
    this.refreshedSeatInfo = null;
  }

  // Seats change on the provider webhook, so the count is re-read whenever a seat dialog opens.
  async refreshSeatInfo() {
    const companyId = this.auth.currentUser?.companyId;
    if (!companyId) return;
    const token = this.seatInfoToken;
    try {
      const next = toSeatInfo(
        await this.auth.fetchJson(`/companies/${companyId}/storage-usage`),
      );
      if (next && token === this.seatInfoToken) this.refreshedSeatInfo = next;
    } catch {
      // Keep the previous value; the server still enforces seat rules.
    }
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  // Nuvo inputs call onInput/onChange as (value, event), not the raw DOM event setField expects.
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
    const cleared = {
      removeTargetId: 'removeTargetError',
      removeReason: 'removeReasonError',
      trimKeepId: 'trimKeepError',
      trimReason: 'trimReasonError',
    }[fieldName];
    if (cleared) this[cleared] = '';
  }

  @action openCreate() {
    this.editUser = null;
    this.showModal = true;
    this.refreshSeatInfo();
  }

  @action openEdit(user) {
    this.editUser = user;
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
  }

  @action resetDrawer() {
    this.editUser = null;
  }

  @action openInvite() {
    this.showInviteModal = true;
    this.refreshSeatInfo();
  }

  @action closeInvite() {
    this.showInviteModal = false;
  }

  @action refresh() {
    this.router.refresh('team');
  }

  @action async openRemove(user) {
    this.userToRemove = user;
    this.removeStep = 1;
    this.removeMode = user?.isActive ? 'deactivate' : 'delete';
    this.removeTargetId = '';
    this.removeReason = '';
    this.removeError = '';
    this.removeReasonError = '';
    this.removeTargetError = '';
    this.reassignCandidates = [];
    this.showRemoveModal = true;
    this.refreshSeatInfo();
    try {
      this.reassignCandidates = await this.loadActiveUsers({
        excludeId: user.id,
        companyId: user.companyId ?? null,
      });
      if (this.reassignCandidates.length === 0) {
        this.removeError =
          'No other active user is available to receive this member’s records.';
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
    this.removeError = '';
    this.removeTargetError = this.removeTargetId
      ? ''
      : 'Choose who receives the records';
    this.removeReasonError = this.removeReason.trim() ? '' : 'Enter a reason';
    if (this.removeTargetError || this.removeReasonError) return;
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
      const moved = (report?.entities || []).reduce(
        (sum, e) => sum + e.count,
        0,
      );
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

  @action openReactivate(user) {
    this.userToReactivate = user;
    this.reactivateReason = '';
    this.showReactivateModal = true;
  }

  @action closeReactivateModal() {
    if (this.isReactivating) return;
    this.showReactivateModal = false;
    this.userToReactivate = null;
  }

  @action async confirmReactivate() {
    if (!this.userToReactivate) return;
    const reactivated = await this.reactivateUser(
      this.userToReactivate,
      this.reactivateReason,
    );
    if (reactivated) {
      this.showReactivateModal = false;
      this.userToReactivate = null;
    }
  }

  @action async reactivateUser(user, reason = '') {
    if (this.reactivatingUserId) return false;
    this.reactivatingUserId = user.id;
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    try {
      await this.auth.fetchJson(`/users/${user.id}/reactivate`, {
        method: 'POST',
        body: JSON.stringify(trimmed ? { reason: trimmed } : {}),
      });
      this.notifications.success(`${user.name} reactivated`);
      this.router.refresh('team');
      return true;
    } catch (e) {
      this.notifications.error(e.message || 'Reactivation failed');
      return false;
    } finally {
      this.reactivatingUserId = null;
    }
  }

  @action async openTrim() {
    this.trimStep = 1;
    this.trimKeepId = this.auth.currentUser?.id ?? '';
    this.trimReason = 'Downgrading to the Free plan';
    this.trimError = '';
    this.trimReasonError = '';
    this.trimKeepError = '';
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
    this.trimError = '';
    this.trimKeepError = this.trimKeepId
      ? ''
      : 'Choose the company admin who stays active';
    this.trimReasonError = this.trimReason.trim() ? '' : 'Enter a reason';
    if (this.trimKeepId && this.trimOthersCount === 0) {
      this.trimError =
        'You already have only one active user. Nothing to trim.';
    }
    if (this.trimKeepError || this.trimReasonError || this.trimError) return;
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
