import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { seesAllRegions, assignableRoles } from 'land/utils/roles';
import { toggleArrayItem } from 'land/utils/toggle-array-item';

function formFrom(user, activeRegionCode) {
  if (!user) {
    return {
      formName: '',
      formEmail: '',
      formPassword: '',
      formRole: 'agent',
      // Seeded with the active region so a new member is never created unscoped.
      selectedRegionCodes: activeRegionCode ? [activeRegionCode] : [],
    };
  }
  return {
    formName: user.name ?? '',
    formEmail: user.email ?? '',
    formPassword: '',
    formRole: user.role ?? 'agent',
    selectedRegionCodes: [...(user.regionCodes ?? [])],
  };
}

// No @user means create.
export default class TeamMemberDrawerComponent extends Component {
  @service auth;
  @service notifications;
  @service region;

  @tracked draft = null;
  @tracked isSaving = false;
  @tracked error = null;

  draftFor = null;

  // Draft and error are keyed to the record they were made for.
  get source() {
    return this.args.user?.id ?? 'new';
  }

  get form() {
    if (this.draft && this.draftFor === this.source) return this.draft;
    return formFrom(this.args.user, this.region.regionCode);
  }

  get isEdit() {
    return Boolean(this.args.user);
  }

  get isEditingSelf() {
    return this.isEdit && this.args.user.id === this.auth.currentUser?.id;
  }

  get errorMsg() {
    return this.error?.source === this.source ? this.error.message : '';
  }

  get submitLabel() {
    if (this.isSaving) return 'Saving...';
    return this.isEdit ? 'Update' : 'Create';
  }

  get roles() {
    return assignableRoles(this.auth.currentUser?.role);
  }

  // Only admins reach this page, and an admin bootstrap carries every company region.
  get assignableRegions() {
    return this.region.regions;
  }

  get hasAllRegions() {
    return seesAllRegions(this.form.formRole);
  }

  get allRegionsNote() {
    return this.isEditingSelf
      ? 'You are a company admin. You have access to all regions.'
      : 'Company admins have access to all regions.';
  }

  get hasNoRegionsSelected() {
    return !this.hasAllRegions && this.form.selectedRegionCodes.length === 0;
  }

  @action setField(name, value) {
    this.draftFor = this.source;
    this.draft = { ...this.form, [name]: value };
  }

  @action toggleRegion(code) {
    this.setField(
      'selectedRegionCodes',
      toggleArrayItem(this.form.selectedRegionCodes, code),
    );
  }

  @action close() {
    this.args.onClose?.();
  }

  @action reset() {
    this.draft = null;
    this.draftFor = null;
    this.error = null;
    this.args.onClosed?.();
  }

  @action async save(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.error = null;

    const form = this.form;
    const source = this.source;
    const isEdit = this.isEdit;
    const userId = this.args.user?.id;
    const hasAllRegions = this.hasAllRegions;
    const path = isEdit ? `/users/${userId}` : '/users';

    try {
      const body = { name: form.formName };
      if (!this.isEditingSelf) body.role = form.formRole;
      if (!isEdit) {
        body.email = form.formEmail;
        if (form.formPassword) body.password = form.formPassword;
      }

      if (!isEdit) {
        body.regionCodes = form.selectedRegionCodes;
      }

      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });

      // PATCH does not touch assignments, so an edit sends them separately.
      if (isEdit && !hasAllRegions) {
        await this.auth.fetchJson(`/users/${userId}/regions`, {
          method: 'PUT',
          body: JSON.stringify({ regionCodes: form.selectedRegionCodes }),
        });
      }

      this.notifications.success(
        isEdit ? 'Team member updated' : 'Team member created',
      );
      this.close();
      this.args.onSaved?.();
    } catch (e) {
      this.error = { source, message: e.message };
    } finally {
      this.isSaving = false;
    }
  }
}
