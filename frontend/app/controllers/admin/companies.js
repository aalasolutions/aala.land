import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { TIER_LIMITS } from '../../utils/subscription-plans';

export default class AdminCompaniesController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked search = '';
  @tracked editingCompany = null;
  @tracked editTier = '';
  @tracked editExpiry = '';
  @tracked isSaving = false;

  get filteredCompanies() {
    const q = this.search.toLowerCase();
    if (!q) return this.model;
    return this.model.filter((c) => c.name.toLowerCase().includes(q));
  }

  @action
  openEdit(company) {
    this.editingCompany = company;
    this.editTier = company.subscriptionTier || 'FREE';
    this.editExpiry = company.subscriptionExpiresAt
      ? company.subscriptionExpiresAt.slice(0, 10)
      : '';
  }

  @action
  closeEdit() {
    this.editingCompany = null;
  }

  @action
  selectTier(tier) {
    this.editTier = tier;
  }

  @action
  setExpiry(e) {
    this.editExpiry = e.target.value;
  }

  @action
  setSearch(e) {
    this.search = e.target.value;
  }

  @action
  async saveEdit() {
    if (this.isSaving) return;
    this.isSaving = true;
    const limits = TIER_LIMITS[this.editTier];
    const body = {
      subscriptionTier: this.editTier,
      maxUsers: limits.maxUsers,
      maxCountries: limits.maxCountries,
      maxProperties: limits.maxProperties,
      subscriptionExpiresAt: this.editExpiry || null,
    };

    try {
      await this.auth.fetchJson(`/companies/${this.editingCompany.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      this.notifications.success('Plan updated');
      this.closeEdit();
      this.router.refresh('admin.companies');
    } catch (e) {
      this.notifications.error(e.message || 'Failed to save');
    } finally {
      this.isSaving = false;
    }
  }

  @action
  stopPropagation(e) {
    e.stopPropagation();
  }
}
