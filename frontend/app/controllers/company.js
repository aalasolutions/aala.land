import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { isAdminRole } from '../utils/roles';
import { TIER_LIMITS } from '../utils/subscription-plans';

export default class CompanyController extends Controller {
  @service auth;
  @service notifications;
  @service router;
  @service region;
  @service session;
  @service whatsapp;

  @tracked formName = '';
  @tracked formActiveRegions = [];
  @tracked formDefaultRegionCode = '';
  @tracked isSaving = false;
  @tracked errorMsg = '';
  @tracked expandedCountries = [];
  @tracked storageUsage = null;
  @tracked billing = null;
  @tracked isBillingBusy = false;
  @tracked showDowngradeConfirm = false;

  @tracked activeTab = 'general';
  @tracked aiPrompt = '';
  @tracked isSavingAI = false;
  @tracked aiSuccessMsg = '';
  @tracked aiErrorMsg = '';
  @tracked weeklyLimit = null;
  @tracked weeklyUsed = null;
  @tracked weeklyResetsAt = null;

  @action toggleCountry(countryCode) {
    if (this.expandedCountries.includes(countryCode)) {
      this.expandedCountries = this.expandedCountries.filter(c => c !== countryCode);
    } else {
      this.expandedCountries = [...this.expandedCountries, countryCode];
    }
  }

  @action selectedCountInGroup(regions) {
    return regions.filter(r => this.formActiveRegions.includes(r.code)).length;
  }

  get company() {
    return this.model?.company;
  }

  get isPaid() {
    const tier = this.company?.subscriptionTier;
    return tier && tier !== 'FREE';
  }

  get planTierClass() {
    const tier = (this.company?.subscriptionTier || 'FREE').toLowerCase();
    return `plan-banner--${tier}`;
  }

  get planNameClass() {
    const tier = (this.company?.subscriptionTier || 'FREE').toLowerCase();
    return `plan-banner__name--${tier}`;
  }

  get planLimits() {
    const c = this.company;
    if (!c) return '';
    const unlimited = TIER_LIMITS.PRO.maxUsers;
    const users = c.maxUsers >= unlimited ? '∞' : c.maxUsers;
    const countries = c.maxCountries >= unlimited ? '∞' : c.maxCountries;
    const props = c.maxProperties >= unlimited ? '∞' : c.maxProperties;
    const used = c.usersCount ?? '?';
    return `${used} / ${users} users · ${countries} countr${countries === 1 ? 'y' : 'ies'} · ${props} properties`;
  }

  get isAdmin() {
    return isAdminRole(this.auth.currentUser?.role);
  }

  get isStorageWarning() {
    return (this.storageUsage?.percentUsed ?? 0) >= 90;
  }

  get seatLabel() {
    return this.storageUsage?.purchasedSeats === 1 ? 'seat' : 'seats';
  }

  get isFreeTier() {
    return (this.company?.subscriptionTier || 'FREE') === 'FREE';
  }

  get seatSummaryLabel() {
    const seats = this.billing?.purchasedSeats ?? 1;
    const activeUsers = this.billing?.activeUsers ?? 0;
    const seatWord = seats === 1 ? 'seat' : 'seats';
    const userWord = activeUsers === 1 ? 'user' : 'users';
    // "purchased" only when there is a real paid subscription. FREE and
    // comped/admin-set tiers have seats but did not buy them, so the word
    // would misread as "you are paying for these".
    const seatPhrase = this.billing?.hasSubscription
      ? `${seats} ${seatWord} purchased`
      : `${seats} ${seatWord}`;
    return `${seatPhrase}, ${activeUsers} active ${userWord}`;
  }

  get seatPriceLabel() {
    if (!this.billing?.seatAmount || !this.billing?.currency) return null;
    const amount = this.billing.seatAmount / 100;
    return `${amount} ${this.billing.currency.toUpperCase()} per seat per month`;
  }

  get isCompanyAdmin() {
    return this.auth.currentUser?.role === 'company_admin';
  }

  // Downgrade is blocked while a billing request is in flight, or when the
  // backend gate would 409 (more than 1 active user). Disabling here avoids a
  // guaranteed-fail request and a pointless confirmation modal.
  get isDowngradeDisabled() {
    return this.isBillingBusy || !this.billing?.canDowngradeToFree;
  }

  get weeklyUsageLabel() {
    if (this.weeklyLimit === null) return null;
    const used = this.weeklyUsed ?? 0;
    let suffix = '';
    if (this.weeklyResetsAt) {
      const resetDate = new Date(this.weeklyResetsAt);
      const daysLeft = Math.ceil((resetDate - Date.now()) / 86400000);
      const day = resetDate.toLocaleDateString('en-US', { weekday: 'short' });
      const time = resetDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      suffix = ` - resets in ${daysLeft}d (${day} - ${time})`;
    }
    return `You've used ${used}/${this.weeklyLimit} AI messages this week${suffix}`;
  }

  get maxCountries() {
    return this.company?.maxCountries ?? 1;
  }

  get selectedCountries() {
    const regions = this.model?.regions || [];
    const countries = new Set();
    for (const code of this.formActiveRegions) {
      const r = regions.find(reg => reg.code === code);
      if (r) countries.add(r.country);
    }
    return [...countries];
  }

  get canAddMoreCountries() {
    return this.selectedCountries.length < this.maxCountries;
  }

  get activeRegionObjects() {
    const regions = this.model?.regions || [];
    return regions.filter((r) => this.formActiveRegions.includes(r.code));
  }

  get activeRegionOptions() {
    return this.activeRegionObjects.map(r => ({
      value: r.code,
      label: `${r.name} (${r.currency})`
    }));
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action setTab(tab) { this.activeTab = tab; }

  @action setAIPrompt(event) {
    this.aiPrompt = event.target.value;
    this.aiSuccessMsg = '';
    this.aiErrorMsg = '';
  }

  @action async saveAISettings(event) {
    if (event) event.preventDefault();
    if (!this.isCompanyAdmin || this.isSavingAI) return;

    this.isSavingAI = true;
    this.aiSuccessMsg = '';
    this.aiErrorMsg = '';

    try {
      const promptToSave = this.aiPrompt.trim() || null;
      await this.whatsapp.updateSettings(promptToSave);
      this.aiSuccessMsg = 'Settings saved.';
    } catch {
      this.aiErrorMsg = 'Failed to save. Please try again.';
    } finally {
      this.isSavingAI = false;
    }
  }

  @action async restoreDefaultPrompt() {
    if (!this.isCompanyAdmin || this.isSavingAI) return;

    this.aiPrompt = '';
    this.isSavingAI = true;
    this.aiSuccessMsg = '';
    this.aiErrorMsg = '';

    try {
      await this.whatsapp.updateSettings(null);
      this.aiSuccessMsg = 'Restored to default prompt.';
    } catch {
      this.aiErrorMsg = 'Failed to restore. Please try again.';
    } finally {
      this.isSavingAI = false;
    }
  }

  @action async upgradeToPro() {
    if (!this.isCompanyAdmin || this.isBillingBusy) return;
    this.isBillingBusy = true;
    try {
      const successUrl = `${window.location.origin}${this.router.urlFor('billing.success')}`;
      const cancelUrl = `${window.location.origin}${this.router.urlFor('billing.cancel')}`;
      const res = await this.auth.fetchJson('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ successUrl, cancelUrl }),
      });
      const url = res?.data?.checkoutUrl;
      if (url) {
        window.location.assign(url);
      } else {
        this.notifications.error('Could not start checkout. Please try again.');
        this.isBillingBusy = false;
      }
    } catch (e) {
      this.notifications.error(e.message);
      this.isBillingBusy = false;
    }
    // Deliberately not cleared on success: the browser is navigating to Stripe.
  }

  @action openDowngradeConfirm() {
    this.showDowngradeConfirm = true;
  }

  @action closeDowngradeConfirm() {
    this.showDowngradeConfirm = false;
  }

  @action async confirmDowngrade() {
    if (this.isBillingBusy) return;
    this.isBillingBusy = true;
    try {
      await this.auth.fetchJson('/billing/cancel', { method: 'POST' });
      this.showDowngradeConfirm = false;
      this.notifications.success('Subscription will end at the close of the current billing period.');
      this.router.refresh('company');
    } catch (e) {
      // 409 carries the active-user-count message from the backend gate.
      this.notifications.error(e.message);
    } finally {
      this.isBillingBusy = false;
    }
  }

  @action toggleRegion(code) {
    if (!this.isAdmin) return;

    if (this.formActiveRegions.includes(code)) {
      this.formActiveRegions = this.formActiveRegions.filter((c) => c !== code);
      if (this.formDefaultRegionCode === code) {
        this.formDefaultRegionCode = this.formActiveRegions[0] || '';
      }
    } else {
      const regions = this.model?.regions || [];
      const regionObj = regions.find(r => r.code === code);
      const regionCountry = regionObj?.country;

      if (!this.selectedCountries.includes(regionCountry) && !this.canAddMoreCountries) {
        const limit = this.maxCountries;
        this.notifications.error(`Your ${this.company?.subscriptionTier || 'FREE'} plan allows ${limit} ${limit === 1 ? 'country' : 'countries'}. Upgrade to add more.`);
        return;
      }

      this.formActiveRegions = [...this.formActiveRegions, code];
      if (this.formActiveRegions.length === 1) {
        this.formDefaultRegionCode = code;
      }
    }
  }

  @action async saveCompany(event) {
    event.preventDefault();
    if (!this.isAdmin) {
      this.errorMsg = 'Only company admins and super admins can update company settings.';
      return;
    }

    if (this.isSaving) return;

    if (this.formActiveRegions.length === 0) {
      this.errorMsg = 'At least one region must be selected.';
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';

    const companyId = this.auth.currentUser?.companyId;

    try {
      const defaultRegionCode = this.formDefaultRegionCode || this.formActiveRegions[0];
      await this.auth.fetchJson(`/companies/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: this.formName,
          activeRegions: this.formActiveRegions,
          defaultRegionCode,
        }),
      });

      // Re-initialize region service with updated active regions
      const allRegions = this.model?.regions || [];
      const newActiveRegions = allRegions.filter((r) => this.formActiveRegions.includes(r.code));
      this.region.initialize(newActiveRegions, this.formDefaultRegionCode);

      // Persist to session storage so hard reload keeps the new regions
      this.session.data.authenticated.regions = newActiveRegions;
      this.session.data.authenticated.defaultRegionCode = this.formDefaultRegionCode;
      this.session.saveToStorage();

      this.notifications.success('Company updated');
      this.router.refresh('company');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
