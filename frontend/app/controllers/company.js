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
  // Selected payment currency (default USD), sent at checkout.
  @tracked selectedCurrency = 'usd';

  @tracked activeTab = 'general';
  @tracked aiPrompt = '';
  @tracked isSavingAI = false;
  @tracked aiSuccessMsg = '';
  @tracked aiErrorMsg = '';
  @tracked weeklyLimit = null;
  @tracked weeklyUsed = null;
  @tracked weeklyResetsAt = null;

  // Billing history (payment/invoice records), paginated in place.
  @tracked billingHistory = [];
  @tracked billingHistoryTotal = 0;
  @tracked billingHistoryPage = 1;
  @tracked billingHistoryLimit = 10;
  @tracked isLoadingHistory = false;

  @action toggleCountry(countryCode) {
    if (this.expandedCountries.includes(countryCode)) {
      this.expandedCountries = this.expandedCountries.filter(
        (c) => c !== countryCode,
      );
    } else {
      this.expandedCountries = [...this.expandedCountries, countryCode];
    }
  }

  @action selectedCountInGroup(regions) {
    return regions.filter((r) => this.formActiveRegions.includes(r.code))
      .length;
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
    const regions = c.maxRegions >= unlimited ? '∞' : c.maxRegions;
    const props = c.maxProperties >= unlimited ? '∞' : c.maxProperties;
    const used = c.usersCount ?? '?';
    return `${used} / ${users} users · ${regions} region${regions === 1 ? '' : 's'} · ${props} properties`;
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
    const currency = this.billing?.currency?.toUpperCase();
    const seat = this.billing?.seatAmount
      ? this.billing.seatAmount / 100
      : null;
    const tier = this.billing?.tier || this.company?.subscriptionTier || 'FREE';
    if (!currency || !seat) return null;
    // FREE is $0; the Upgrade section explains Pro pricing, so no price line here.
    if (tier === 'FREE') return null;
    if (tier === 'ENTERPRISE') return 'Custom Enterprise pricing';
    // PRO is pure per-seat with no base fee; the owner is the first paid seat.
    return `${seat} ${currency} per seat per month`;
  }

  // The locked payment currency, shown once the company has a subscription.
  get purchasedCurrency() {
    if (!this.billing?.hasSubscription) return null;
    return this.billing?.currency?.toUpperCase() ?? null;
  }

  get isCompanyAdmin() {
    return this.auth.currentUser?.role === 'company_admin';
  }

  // Currency choices for the upgrade selector; backend returns [] once subscribed.
  get paymentCurrencyOptions() {
    const options = this.billing?.currencyOptions ?? [];
    return options.map((o) => ({
      value: o.currency,
      label: `${o.currency.toUpperCase()}: ${o.seatAmount / 100} per seat / month`,
    }));
  }

  // Downgrade is blocked while a billing request is in flight, or when the
  // backend gate would 409 (more than 1 active user). Disabling here avoids a
  // guaranteed-fail request and a pointless confirmation modal.
  get isDowngradeDisabled() {
    return this.isBillingBusy || !this.billing?.canDowngradeToFree;
  }

  // A queued downgrade: the subscription is set to end at period close and reverts
  // to FREE then. Drives the scheduled-cancellation banner and the Reactivate Pro
  // button in place of Downgrade to Free.
  get isScheduledToCancel() {
    return !!this.billing?.cancelAtPeriodEnd;
  }

  get cancelDateLabel() {
    if (!this.billing?.cancelAt) return null;
    return new Date(this.billing.cancelAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  get weeklyUsageLabel() {
    if (this.weeklyLimit === null) return null;
    const used = this.weeklyUsed ?? 0;
    let suffix = '';
    if (this.weeklyResetsAt) {
      const resetDate = new Date(this.weeklyResetsAt);
      const daysLeft = Math.ceil((resetDate - Date.now()) / 86400000);
      const day = resetDate.toLocaleDateString('en-US', { weekday: 'short' });
      const time = resetDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      suffix = ` - resets in ${daysLeft}d (${day} - ${time})`;
    }
    return `You've used ${used}/${this.weeklyLimit} AI messages this week${suffix}`;
  }

  get maxRegions() {
    return this.company?.maxRegions ?? 1;
  }

  get canAddMoreRegions() {
    return this.formActiveRegions.length < this.maxRegions;
  }

  get activeRegionObjects() {
    const regions = this.model?.regions || [];
    return regions.filter((r) => this.formActiveRegions.includes(r.code));
  }

  get activeRegionOptions() {
    return this.activeRegionObjects.map((r) => ({
      value: r.code,
      label: `${r.name} (${r.currency})`,
    }));
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  @action setTab(tab) {
    this.activeTab = tab;
  }

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
        body: JSON.stringify({
          successUrl,
          cancelUrl,
          currency: this.selectedCurrency,
        }),
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
      this.notifications.success(
        'Subscription will end at the close of the current billing period.',
      );
      this.router.refresh('company');
    } catch (e) {
      // 409 carries the active-user-count message from the backend gate.
      this.notifications.error(e.message);
    } finally {
      this.isBillingBusy = false;
    }
  }

  @action async reactivatePro() {
    if (this.isBillingBusy) return;
    this.isBillingBusy = true;
    try {
      await this.auth.fetchJson('/billing/resume', { method: 'POST' });
      this.notifications.success(
        'Your subscription will keep renewing. The scheduled downgrade is canceled.',
      );
      this.router.refresh('company');
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.isBillingBusy = false;
    }
  }

  // -- Billing history pagination (in place, no query params) --------------

  get billingHistoryHasNext() {
    return (
      this.billingHistoryPage * this.billingHistoryLimit <
      this.billingHistoryTotal
    );
  }

  get billingHistoryHasPrevious() {
    return this.billingHistoryPage > 1;
  }

  async fetchBillingHistory(page, limit) {
    if (this.isLoadingHistory) return;
    this.isLoadingHistory = true;
    try {
      const res = await this.auth.fetchJson(
        `/billing/history?page=${page}&limit=${limit}`,
      );
      const payload = res?.data ?? {};
      this.billingHistory = payload.data ?? [];
      this.billingHistoryTotal = payload.total ?? 0;
      this.billingHistoryPage = payload.page ?? page;
      this.billingHistoryLimit = payload.limit ?? limit;
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.isLoadingHistory = false;
    }
  }

  @action billingHistoryNext() {
    if (!this.billingHistoryHasNext) return;
    this.fetchBillingHistory(
      this.billingHistoryPage + 1,
      this.billingHistoryLimit,
    );
  }

  @action billingHistoryPrevious() {
    if (!this.billingHistoryHasPrevious) return;
    this.fetchBillingHistory(
      this.billingHistoryPage - 1,
      this.billingHistoryLimit,
    );
  }

  @action setBillingHistoryLimit(e) {
    // Ui::Pagination binds this to the <select>'s change event, not a value.
    this.fetchBillingHistory(1, Number(e?.target?.value) || 10);
  }

  @action toggleRegion(code) {
    if (!this.isAdmin) return;

    if (this.formActiveRegions.includes(code)) {
      this.formActiveRegions = this.formActiveRegions.filter((c) => c !== code);
      if (this.formDefaultRegionCode === code) {
        this.formDefaultRegionCode = this.formActiveRegions[0] || '';
      }
    } else {
      if (!this.canAddMoreRegions) {
        const limit = this.maxRegions;
        this.notifications.error(
          `Your ${this.company?.subscriptionTier || 'FREE'} plan allows ${limit} ${limit === 1 ? 'region' : 'regions'}. Upgrade to add more.`,
        );
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
      this.errorMsg =
        'Only company admins and super admins can update company settings.';
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
      const defaultRegionCode =
        this.formDefaultRegionCode || this.formActiveRegions[0];
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
      const newActiveRegions = allRegions.filter((r) =>
        this.formActiveRegions.includes(r.code),
      );
      this.region.initialize(newActiveRegions, this.formDefaultRegionCode);

      // Persist to session storage so hard reload keeps the new regions
      this.session.data.authenticated.regions = newActiveRegions;
      this.session.data.authenticated.defaultRegionCode =
        this.formDefaultRegionCode;
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
