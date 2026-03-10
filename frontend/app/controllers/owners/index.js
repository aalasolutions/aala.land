import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

export default class OwnersIndexController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked showModal = false;
  @tracked editOwner = null;
  @tracked formName = '';
  @tracked formEmail = '';
  @tracked formPhone = '';
  @tracked formNationalityId = '';
  @tracked formAddress = '';
  @tracked formNotes = '';
  @tracked formAssignedAgentId = '';
  @tracked agents = [];
  @tracked isSaving = false;
  @tracked isLoadingAgents = false;
  @tracked errorMsg = '';

  constructor() {
    super(...arguments);
    this.loadAgents();
  }

  async loadAgents() {
    this.isLoadingAgents = true;
    try {
      const data = await this.auth.fetchJson('/users/agents');
      this.agents = data.data || [];
    } catch (e) {
      console.error('Failed to load agents:', e);
    } finally {
      this.isLoadingAgents = false;
    }
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action openCreate() {
    this.formName = '';
    this.formEmail = '';
    this.formPhone = '';
    this.formNationalityId = '';
    this.formAddress = '';
    this.formNotes = '';
    this.formAssignedAgentId = '';
    this.editOwner = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(owner) {
    this.formName = owner.name ?? '';
    this.formEmail = owner.email ?? '';
    this.formPhone = owner.phone ?? '';
    this.formNationalityId = owner.nationalityId ?? '';
    this.formAddress = owner.address ?? '';
    this.formNotes = owner.notes ?? '';
    this.formAssignedAgentId = owner.assignedAgentId ?? '';
    this.editOwner = owner;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editOwner = null;
    this.errorMsg = '';
  }

  @action async saveOwner(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editOwner;
    const path = isEdit ? `/owners/${this.editOwner.id}` : '/owners';

    try {
      const body = {
        name: this.formName,
        email: this.formEmail || null,
        phone: this.formPhone || null,
        nationalityId: this.formNationalityId || null,
        address: this.formAddress || null,
        notes: this.formNotes || null,
        assignedAgentId: this.formAssignedAgentId || null,
      };

      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });

      this.notifications.success(isEdit ? 'Owner updated' : 'Owner created');
      this.closeModal();
      this.router.refresh('owners');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }

  @action async deleteOwner(owner) {
    if (!confirm(`Remove ${owner.name}?`)) return;

    try {
      await this.auth.fetchJson(`/owners/${owner.id}`, { method: 'DELETE' });
      this.notifications.success('Owner removed');
      this.router.refresh('owners');
    } catch (e) {
      this.notifications.error(e.message);
    }
  }

  @action viewOwner(owner) {
    this.router.transitionTo('owners.detail', owner.id);
  }
}
