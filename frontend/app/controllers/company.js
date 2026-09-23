import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { validPage } from 'land/utils/page-number';
import { service } from '@ember/service';
import { canManageRegions, isAdminRole } from '../utils/roles';
import { TIER_LIMITS } from '../utils/subscription-plans';
import { daysUntil, formatInstant } from '../utils/local-date';

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
  @tracked showRegionRemovalConfirm = false;
  // Selected payment currency (default USD), sent at checkout.
  @tracked selectedCurrency = 'usd';

  // Bound to its own property because route setup resets activeTab on every entry.
  queryParams = ['tab'];

  // Null keeps `?tab=` out of the URL until a tab is picked.
  @tracked tab = null;

  // Default panel, used whenever the URL carries no tab.
  @tracked activeTab = 'general';
  @tracked aiPrompt = '';
  @tracked isSavingAI = false;
  @tracked aiSuccessMsg = '';
  @tracked aiErrorMsg = '';
  @tracked creditsLimit = null;
  @tracked creditsUsed = null;
  @tracked creditsResetsAt = null;
  @tracked creditAgents = [];

  // Billing history (payment/invoice records), paginated in place.
  @tracked billingHistory = [];
  @tracked billingHistoryTotal = 0;
  @tracked billingHistoryPage = 1;
  @tracked billingHistoryLimit = 10;
  @tracked isLoadingHistory = false;

  routeWillChangeHandler = null;

  constructor() {
    super(...arguments);
    // Controllers are singletons, so transient page state must not survive the visit.
    this.routeWillChangeHandler = (transition) => {
      if (
        transition.from?.name === 'company' &&
        transition.to?.name !== 'company'
      ) {
        this.resetTransientState();
      }
    };
    this.router.on('routeWillChange', this.routeWillChangeHandler);
  }

  willDestroy() {
    if (this.routeWillChangeHandler) {
      this.router.off('routeWillChange', this.routeWillChangeHandler);
      this.routeWillChangeHandler = null;
    }
    super.willDestroy(...arguments);
  }

  resetTransientState() {
    // Route setup only repopulates these when a company is loaded.
    this.formName = '';
    this.formActiveRegions = [];
    this.formDefaultRegionCode = '';
    this.errorMsg = '';
    this.isSaving = false;
    this.expandedCountries = [];
    this.showDowngradeConfirm = false;
    this.showRegionRemovalConfirm = false;
    this.selectedCurrency = 'usd';
  }

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

  // Region edits are owner-only; isAdmin still gates the rest of the company form.
  get canManageRegions() {
    return canManageRegions(this.auth.currentUser?.role);
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
    // "purchased" only for real paid subs; comped/FREE tiers have seats but didn't buy them.
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

  // Downgrade blocked mid-request or when backend would 409, to avoid a guaranteed-fail confirm.
  get isDowngradeDisabled() {
    return this.isBillingBusy || !this.billing?.canDowngradeToFree;
  }

  // Queued downgrade: ends at period close, reverts to FREE; drives the banner/button swap.
  get isScheduledToCancel() {
    return !!this.billing?.cancelAtPeriodEnd;
  }

  get cancelDateLabel() {
    if (!this.billing?.cancelAt) return null;
    return formatInstant(this.billing.cancelAt, undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  get creditUsageLabel() {
    if (this.creditsLimit === null) return null;
    const used = this.creditsUsed ?? 0;
    let suffix = '';
    const daysToReset = daysUntil(this.creditsResetsAt);
    // The page can outlive the period it loaded, so never render a negative countdown.
    if (daysToReset !== null) {
      const daysLeft = Math.max(0, daysToReset);
      const date = formatInstant(this.creditsResetsAt, 'en-US', {
        month: 'short',
        day: 'numeric',
      });
      suffix = ` - resets in ${daysLeft}d (${date})`;
    }
    return `You've used ${used}/${this.creditsLimit} AI credits this period${suffix}`;
  }

  get hasCreditAgents() {
    return (this.creditAgents?.length ?? 0) > 0;
  }

  creditAgentColumns = [
    { name: 'Agent', valuePath: 'name', width: 220, isFixed: 'left' },
    { name: 'Credits', valuePath: 'credits', width: 120, numeric: true },
    { name: 'Leads', valuePath: 'leads', width: 120, numeric: true },
    { name: 'AI turns', valuePath: 'aiTurns', width: 130, numeric: true },
  ];

  // Credit rows carry `userId`, not the `id` DataTable keys rows by.
  get creditAgentRows() {
    return (this.creditAgents ?? []).map((agent) => ({
      ...agent,
      id: agent.userId,
    }));
  }

  billingHistoryColumns = [
    {
      name: 'Date',
      valuePath: 'occurredAt',
      width: 140,
      isFixed: 'left',
      numeric: true,
    },
    { name: 'Amount', valuePath: 'amount', width: 140, numeric: true },
    { name: 'Status', valuePath: 'type', width: 140 },
    { name: 'Invoice', valuePath: 'hostedInvoiceUrl', width: 160 },
  ];

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

  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  // Stripe spells it `canceled` (one L); app badges use the correct `cancelled` spelling.
  get billingStatusBadgeValue() {
    const status = this.billing?.billingStatus;
    if (!status) return null;
    return status === 'canceled' ? 'cancelled' : status;
  }

  get settingsTabs() {
    return [
      { id: 'general', label: 'General' },
      { id: 'regions', label: 'Manage Regions' },
      { id: 'ai', label: 'AI Settings' },
      { id: 'billing', label: 'Billing' },
    ];
  }

  // Unknown tab ids from the URL fall back to the default panel.
  get currentTab() {
    const requested = this.tab ?? this.activeTab;
    return this.settingsTabs.some((t) => t.id === requested)
      ? requested
      : 'general';
  }

  @action setTab(tab) {
    this.tab = tab;
  }

  @action setAIPrompt(value) {
    this.aiPrompt = value;
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

  get billingHistoryTotalPages() {
    return Math.max(
      1,
      Math.ceil(this.billingHistoryTotal / this.billingHistoryLimit),
    );
  }

  @action billingHistoryGoToPage(page) {
    const target = validPage(page, this.billingHistoryTotalPages);
    if (target === null) return;
    this.fetchBillingHistory(target, this.billingHistoryLimit);
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
    this.fetchBillingHistory(1, Number(e?.target?.value) || 50);
  }

  @action toggleRegionChecked(code) {
    this.toggleRegion(code);
  }

  @action toggleRegion(code) {
    if (!this.canManageRegions) return;

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

  // Saved regions the pending edit drops; the server prunes them off every user.
  get removedRegionNames() {
    const saved = this.company?.activeRegions || [];
    const regions = this.model?.regions || [];
    return saved
      .filter((code) => !this.formActiveRegions.includes(code))
      .map((code) => regions.find((r) => r.code === code)?.name || code);
  }

  get regionRemovalMessage() {
    const names = this.removedRegionNames;
    const pronoun = names.length === 1 ? 'it' : 'them';
    return `${names.join(', ')} will be removed from every user assigned to ${pronoun}. Those user assignments are not restored if you add ${pronoun} back later.`;
  }

  @action closeRegionRemovalConfirm() {
    this.showRegionRemovalConfirm = false;
  }

  @action async confirmRegionRemoval() {
    if (this.isSaving) return;
    await this.persistCompany();
    this.showRegionRemovalConfirm = false;
  }

  @action saveCompany(event) {
    if (event) event.preventDefault();
    if (!this.isAdmin) {
      this.errorMsg =
        'Only company admins and super admins can update company settings.';
      return;
    }
    // Regions are a paid entitlement, so an admin saving the form must not carry region edits.
    const regionsChanged =
      this.canManageRegions ||
      (JSON.stringify([...this.formActiveRegions].sort()) ===
        JSON.stringify([...(this.company?.activeRegions ?? [])].sort()) &&
        this.formDefaultRegionCode === (this.company?.defaultRegionCode ?? ''));
    if (!regionsChanged) {
      this.errorMsg = 'Only company admins can add or remove regions.';
      return;
    }

    if (this.isSaving) return;

    if (this.formActiveRegions.length === 0) {
      this.errorMsg = 'At least one region must be selected.';
      return;
    }

    if (this.removedRegionNames.length) {
      this.errorMsg = '';
      this.showRegionRemovalConfirm = true;
      return;
    }

    return this.persistCompany();
  }

  async persistCompany() {
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
