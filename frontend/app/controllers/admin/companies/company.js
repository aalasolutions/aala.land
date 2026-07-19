import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { runTask } from 'ember-lifeline';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'deal', label: 'Deal' },
  { value: 'payments', label: 'Payments' },
  { value: 'history', label: 'History' },
];

const BASIS_OPTIONS = [
  { value: 'per_seat', label: 'per seat / month' },
  { value: 'total_month', label: 'total per month' },
];

/** Friendly one-liners for the History tab, keyed by audit newValue.event. */
const HISTORY_EVENTS = {
  deal_granted: 'Deal granted',
  deal_edited: 'Deal edited',
  deal_ended: 'Deal ended early',
  lock_lifted: 'Lock lifted',
  lift_ended: 'Lift ended',
  manual_payment_recorded: 'Manual payment recorded',
  refund_initiated: 'Refund initiated',
  next_bill_discount: 'Next-bill discount',
};

export default class AdminCompaniesCompanyController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked detail = null;
  @tracked activeTab = 'overview';

  // Guards against a stale async response landing on a different company.
  loadToken = 0;

  // Deal modal
  @tracked dealModalOpen = false;
  @tracked dealEditing = false;
  @tracked dealPrice = '';
  @tracked dealCurrency = 'usd';
  @tracked dealBasis = 'per_seat';
  @tracked dealSeatCap = '';
  @tracked dealUntil = '';
  @tracked dealLifetime = false;
  @tracked dealWhy = '';
  @tracked dealBusy = false;
  @tracked endDealConfirmOpen = false;
  @tracked endDealBusy = false;

  // Lock lift
  @tracked liftDate = '';
  @tracked liftBusy = false;
  @tracked endLiftConfirmOpen = false;
  @tracked endLiftBusy = false;

  // Limits modal
  @tracked limitsModalOpen = false;
  @tracked limitMaxUsers = '';
  @tracked limitMaxRegions = '';
  @tracked limitMaxProperties = '';
  @tracked limitsBusy = false;

  // Payments
  @tracked paymentsLoading = false;
  @tracked paymentsLoaded = false;
  @tracked paymentRows = [];
  @tracked paymentModalOpen = false;
  @tracked payAmount = '';
  @tracked payCurrency = 'usd';
  @tracked payReceivedAt = '';
  @tracked payCoversStart = '';
  @tracked payCoversEnd = '';
  @tracked payNotes = '';
  @tracked payReceipt = null;
  @tracked payReceiptName = '';
  @tracked payBusy = false;

  // Make it right (remedy)
  @tracked remedyModalOpen = false;
  @tracked remedyAnchor = null;
  @tracked remedyKind = 'discount_next_bill';
  @tracked remedyScope = 'partial';
  @tracked remedyAmount = '';
  @tracked remedyWhy = '';
  @tracked remedyBusy = false;

  // History
  @tracked historyLoading = false;
  @tracked historyLoaded = false;
  @tracked historyRows = [];

  tabs = TABS;
  basisOptions = BASIS_OPTIONS;

  /**
   * Wipe every per-company surface. Called from the route on model change so
   * switching between two detail pages never leaks state.
   */
  resetForCompany(model) {
    this.loadToken++;
    this.detail = model;
    this.activeTab = 'overview';

    this.dealModalOpen = false;
    this.endDealConfirmOpen = false;
    this.liftDate = '';
    this.endLiftConfirmOpen = false;
    this.limitsModalOpen = false;

    this.paymentsLoading = false;
    this.paymentsLoaded = false;
    this.paymentRows = [];
    this.paymentModalOpen = false;

    this.remedyModalOpen = false;
    this.remedyAnchor = null;

    this.historyLoading = false;
    this.historyLoaded = false;
    this.historyRows = [];
  }

  // --- Derived state --------------------------------------------------------

  get company() {
    return this.detail;
  }

  get deal() {
    return this.detail?.deal ?? null;
  }

  get billing() {
    return this.detail?.billing ?? null;
  }

  get lock() {
    return this.detail?.lockState ?? null;
  }

  get isLocked() {
    return !!this.lock?.locked;
  }

  get isLifted() {
    return !!this.lock?.lifted;
  }

  get showLockCard() {
    return this.isLocked || this.isLifted;
  }

  get railLabel() {
    return this.detail?.rail ?? null;
  }

  get adminUser() {
    return this.detail?.adminUser ?? null;
  }

  get statusView() {
    if (this.isLocked) return { text: 'LOCKED', cls: 'status-failed' };
    if (this.isLifted) return { text: 'lifted', cls: 'status-pending' };
    if (this.deal && !this.deal.expired)
      return { text: 'on a deal', cls: 'status-pending' };
    return { text: 'active', cls: 'status-paid' };
  }

  get dealPriceLabel() {
    if (!this.deal) return '';
    const money = this.formatMoney(this.deal.priceAmount, this.deal.currency);
    return this.deal.basis === 'per_seat'
      ? `${money} per seat`
      : `${money} / mo`;
  }

  get remedyAnchorLabel() {
    if (!this.remedyAnchor) return '';
    return `${this.remedyAnchor.dateLabel} · ${this.formatMoney(
      this.remedyAnchor.amountMinor,
      this.remedyAnchor.currency,
    )}`;
  }

  get remedyIsRefund() {
    return this.remedyKind === 'refund';
  }

  /** Amount field hidden only for a full refund (it takes the whole payment). */
  get showRemedyAmount() {
    return !(this.remedyIsRefund && this.remedyScope === 'full');
  }

  get remedyConfirmLabel() {
    if (this.remedyIsRefund) {
      const amt =
        this.remedyScope === 'full'
          ? this.remedyAnchor?.amountMinor
          : this.toMinor(this.remedyAmount, this.remedyAnchor?.currency);
      return `Refund ${this.formatMoney(amt || 0, this.remedyAnchor?.currency)}`;
    }
    const amt = this.toMinor(this.remedyAmount, this.remedyAnchor?.currency);
    return `Discount next bill by ${this.formatMoney(
      amt || 0,
      this.remedyAnchor?.currency,
    )}`;
  }

  get expiryPreview() {
    if (this.dealLifetime) return 'This deal has no expiry.';
    if (!this.dealUntil)
      return 'Pick an expiry date, or mark the deal lifetime.';
    const date = this.formatDate(this.dealUntil);
    return `On ${date} this account LOCKS: writing stops, reading and export stay. Their admin sees the "reduce or pay" banner. It never silently drops to Free. A super admin can lift the lock.`;
  }

  // --- Tabs -----------------------------------------------------------------

  @action
  selectTab(value) {
    this.activeTab = value;
    if (value === 'payments' && !this.paymentsLoaded) this.loadPayments();
    if (value === 'history' && !this.historyLoaded) this.loadHistory();
  }

  @action
  goBack() {
    this.router.transitionTo('admin.companies.index');
  }

  @action
  async loginAs() {
    if (!this.adminUser) return;
    try {
      await this.auth.impersonate(this.adminUser.id);
    } catch (e) {
      this.notifications.error(e.message || 'Login-as failed');
    }
  }

  async reloadDetail() {
    const token = this.loadToken;
    const res = await this.auth.fetchJson(
      `/console/companies/${this.detail.id}`,
    );
    if (token !== this.loadToken) return;
    if (res?.data) this.detail = res.data;
  }

  // --- Deal modal -----------------------------------------------------------

  @action
  openDealModal() {
    const d = this.deal;
    this.dealEditing = !!d;
    if (d) {
      this.dealPrice = String(this.toMajor(d.priceAmount, d.currency));
      this.dealCurrency = d.currency;
      this.dealBasis = d.basis;
      this.dealSeatCap = String(d.seatCap);
      this.dealLifetime = !!d.lifetime;
      this.dealUntil = d.untilDate ? d.untilDate.slice(0, 10) : '';
      this.dealWhy = d.whyNote;
    } else {
      this.dealPrice = '';
      this.dealCurrency = this.billing?.currency || 'usd';
      this.dealBasis = 'per_seat';
      this.dealSeatCap = '';
      this.dealLifetime = false;
      this.dealUntil = '';
      this.dealWhy = '';
    }
    this.dealModalOpen = true;
  }

  @action
  closeDealModal() {
    if (this.dealBusy) return;
    this.dealModalOpen = false;
  }

  @action
  setDealField(field, event) {
    this[field] = event.target.value;
  }

  @action
  setDealBasis(event) {
    this.dealBasis = event.target.value;
  }

  @action
  toggleDealLifetime(event) {
    this.dealLifetime = event.target.checked;
    if (this.dealLifetime) this.dealUntil = '';
  }

  @action
  async submitDeal() {
    if (this.dealBusy) return;
    const price = this.toMinor(this.dealPrice, this.dealCurrency);
    const seatCap = parseInt(this.dealSeatCap, 10);
    const currency = (this.dealCurrency || '').trim().toLowerCase();

    if (price == null || price < 0) {
      this.notifications.error('Enter a valid price.');
      return;
    }
    if (!/^[a-z]{3}$/.test(currency)) {
      this.notifications.error('Currency must be a 3-letter code.');
      return;
    }
    if (!seatCap || seatCap < 1) {
      this.notifications.error('Seats included must be at least 1.');
      return;
    }
    if (!this.dealLifetime && !this.dealUntil) {
      this.notifications.error('Pick an expiry date, or mark it lifetime.');
      return;
    }
    if (!this.dealWhy.trim()) {
      this.notifications.error('The "why" note is required.');
      return;
    }

    const body = {
      priceAmount: price,
      currency,
      basis: this.dealBasis,
      seatCap,
      whyNote: this.dealWhy.trim(),
    };
    if (this.dealLifetime) {
      body.lifetime = true;
    } else {
      // End-of-day LOCAL time, so picking today is still "in the future"
      // (UTC midnight would already be past and 400 on the backend).
      body.untilDate = new Date(`${this.dealUntil}T23:59:59`).toISOString();
    }

    this.dealBusy = true;
    try {
      await this.auth.fetchJson(`/console/companies/${this.detail.id}/deal`, {
        method: this.dealEditing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(
        this.dealEditing ? 'Deal updated' : 'Deal granted',
      );
      this.dealModalOpen = false;
      await this.reloadDetail();
      if (this.historyLoaded) this.reloadHistory();
    } catch (e) {
      this.notifications.error(e.message || 'Could not save the deal');
    } finally {
      this.dealBusy = false;
    }
  }

  @action
  openEndDealConfirm() {
    this.endDealConfirmOpen = true;
  }

  @action
  closeEndDealConfirm() {
    if (this.endDealBusy) return;
    this.endDealConfirmOpen = false;
  }

  @action
  async confirmEndDeal() {
    if (this.endDealBusy) return;
    this.endDealBusy = true;
    try {
      await this.auth.fetchJson(
        `/console/companies/${this.detail.id}/deal/end`,
        { method: 'POST' },
      );
      this.notifications.success('Deal ended');
      this.endDealConfirmOpen = false;
      await this.reloadDetail();
      if (this.historyLoaded) this.reloadHistory();
    } catch (e) {
      this.notifications.error(e.message || 'Could not end the deal');
    } finally {
      this.endDealBusy = false;
    }
  }

  // --- Lock lift ------------------------------------------------------------

  @action
  setLiftDate(event) {
    this.liftDate = event.target.value;
  }

  @action
  async submitLift() {
    if (this.liftBusy) return;
    if (!this.liftDate) {
      this.notifications.error('Pick a date to lift the lock until.');
      return;
    }
    this.liftBusy = true;
    try {
      await this.auth.fetchJson(`/console/companies/${this.detail.id}/lift`, {
        method: 'POST',
        body: JSON.stringify({
          liftUntil: new Date(`${this.liftDate}T23:59:59`).toISOString(),
        }),
      });
      this.notifications.success('Lock lifted');
      this.liftDate = '';
      await this.reloadDetail();
      if (this.historyLoaded) this.reloadHistory();
    } catch (e) {
      this.notifications.error(e.message || 'Could not lift the lock');
    } finally {
      this.liftBusy = false;
    }
  }

  @action
  openEndLiftConfirm() {
    this.endLiftConfirmOpen = true;
  }

  @action
  closeEndLiftConfirm() {
    if (this.endLiftBusy) return;
    this.endLiftConfirmOpen = false;
  }

  @action
  async confirmEndLift() {
    if (this.endLiftBusy) return;
    this.endLiftBusy = true;
    try {
      await this.auth.fetchJson(
        `/console/companies/${this.detail.id}/lift/end`,
        { method: 'POST' },
      );
      this.notifications.success('Lift ended, lock re-applied');
      this.endLiftConfirmOpen = false;
      await this.reloadDetail();
      if (this.historyLoaded) this.reloadHistory();
    } catch (e) {
      this.notifications.error(e.message || 'Could not end the lift');
    } finally {
      this.endLiftBusy = false;
    }
  }

  // --- Limits modal ---------------------------------------------------------

  @action
  openLimitsModal() {
    const l = this.detail?.limits ?? {};
    this.limitMaxUsers = String(l.maxUsers ?? '');
    this.limitMaxRegions = String(l.maxRegions ?? '');
    this.limitMaxProperties = String(l.maxProperties ?? '');
    this.limitsModalOpen = true;
  }

  @action
  closeLimitsModal() {
    if (this.limitsBusy) return;
    this.limitsModalOpen = false;
  }

  @action
  setLimitField(field, event) {
    this[field] = event.target.value;
  }

  @action
  async submitLimits() {
    if (this.limitsBusy) return;
    const body = {
      maxUsers: parseInt(this.limitMaxUsers, 10),
      maxRegions: parseInt(this.limitMaxRegions, 10),
      maxProperties: parseInt(this.limitMaxProperties, 10),
    };
    if (
      Number.isNaN(body.maxUsers) ||
      Number.isNaN(body.maxRegions) ||
      Number.isNaN(body.maxProperties)
    ) {
      this.notifications.error('Limits must be whole numbers.');
      return;
    }
    this.limitsBusy = true;
    try {
      await this.auth.fetchJson(`/companies/${this.detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      this.notifications.success('Limits updated');
      this.limitsModalOpen = false;
      await this.reloadDetail();
    } catch (e) {
      this.notifications.error(e.message || 'Could not update limits');
    } finally {
      this.limitsBusy = false;
    }
  }

  // --- Payments -------------------------------------------------------------

  async loadPayments() {
    const token = this.loadToken;
    this.paymentsLoading = true;
    try {
      const [manualRes, cardRes] = await Promise.all([
        this.auth.fetchJson(
          `/console/companies/${this.detail.id}/payments?limit=100`,
        ),
        this.auth.fetchJson(
          `/billing/history?companyId=${this.detail.id}&limit=100`,
        ),
      ]);
      if (token !== this.loadToken) return;
      const manual = (manualRes?.data?.data ?? []).map((p) => ({
        id: p.id,
        source: 'manual',
        date: p.receivedAt,
        amount: p.amount,
        currency: p.currency,
        coversLabel: `${this.formatDate(p.coversStart)} – ${this.formatDate(
          p.coversEnd,
        )}`,
        notes: p.notes,
        paid: true,
        hasReceipt: !!p.receiptKey,
        invoiceUrl: null,
      }));
      const card = (cardRes?.data?.data ?? []).map((h) => ({
        id: h.id,
        source: 'card',
        date: h.occurredAt,
        amount: h.amount,
        currency: h.currency,
        coversLabel:
          h.periodStart && h.periodEnd
            ? `${this.formatDate(h.periodStart)} – ${this.formatDate(
                h.periodEnd,
              )}`
            : '—',
        notes: null,
        paid: h.type === 'payment_succeeded',
        hasReceipt: false,
        invoiceUrl: h.hostedInvoiceUrl,
      }));
      this.paymentRows = [...manual, ...card].sort(
        (a, b) => new Date(b.date) - new Date(a.date),
      );
      this.paymentsLoaded = true;
    } catch (e) {
      if (token === this.loadToken)
        this.notifications.error(e.message || 'Could not load payments');
    } finally {
      if (token === this.loadToken) this.paymentsLoading = false;
    }
  }

  reloadPayments() {
    this.paymentsLoaded = false;
    return this.loadPayments();
  }

  @action
  openPaymentModal() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.payAmount = '';
    this.payCurrency = this.deal?.currency || this.billing?.currency || 'usd';
    this.payReceivedAt = today;
    this.payCoversStart = today;
    this.payCoversEnd = '';
    this.payNotes = '';
    this.payReceipt = null;
    this.payReceiptName = '';
    this.paymentModalOpen = true;
  }

  @action
  closePaymentModal() {
    if (this.payBusy) return;
    this.paymentModalOpen = false;
  }

  @action
  setPayField(field, event) {
    this[field] = event.target.value;
  }

  @action
  setPayReceipt(event) {
    const file = event.target.files?.[0] ?? null;
    this.payReceipt = file;
    this.payReceiptName = file?.name ?? '';
  }

  @action
  async submitPayment() {
    if (this.payBusy) return;
    const amount = this.toMinor(this.payAmount, this.payCurrency);
    const currency = (this.payCurrency || '').trim().toLowerCase();
    if (amount == null || amount < 1) {
      this.notifications.error('Enter a valid amount.');
      return;
    }
    if (!/^[a-z]{3}$/.test(currency)) {
      this.notifications.error('Currency must be a 3-letter code.');
      return;
    }
    if (!this.payReceivedAt || !this.payCoversStart || !this.payCoversEnd) {
      this.notifications.error(
        'Received date and covered period are required.',
      );
      return;
    }
    if (this.payCoversEnd < this.payCoversStart) {
      this.notifications.error('The period end cannot be before its start.');
      return;
    }
    if (!this.payNotes.trim() && !this.payReceipt) {
      this.notifications.error('Add notes or a receipt image (document it).');
      return;
    }

    const form = new FormData();
    form.append('amount', String(amount));
    form.append('currency', currency);
    form.append('receivedAt', this.payReceivedAt);
    form.append('coversStart', this.payCoversStart);
    form.append('coversEnd', this.payCoversEnd);
    if (this.payNotes.trim()) form.append('notes', this.payNotes.trim());
    if (this.payReceipt) form.append('receipt', this.payReceipt);

    this.payBusy = true;
    try {
      await this.auth.fetchJson(
        `/console/companies/${this.detail.id}/payments`,
        { method: 'POST', body: form },
      );
      this.notifications.success('Payment recorded');
      this.paymentModalOpen = false;
      await this.reloadPayments();
      await this.reloadDetail();
      if (this.historyLoaded) this.reloadHistory();
    } catch (e) {
      this.notifications.error(e.message || 'Could not record the payment');
    } finally {
      this.payBusy = false;
    }
  }

  @action
  async viewReceipt(paymentId) {
    // Open the window synchronously inside the click gesture so popup
    // blockers allow it; the blob URL lands in it once fetched.
    const viewer = window.open('about:blank', '_blank');
    // Cut the opener link; passing 'noopener' to window.open would return
    // null and break the synchronous-open flow above.
    if (viewer) viewer.opener = null;
    try {
      const res = await this.auth.authorizedFetch(
        `${this.auth.apiBase}/console/payments/${paymentId}/receipt`,
      );
      if (!res.ok) throw new Error('Receipt unavailable');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (viewer && !viewer.closed) {
        viewer.location = url;
      } else {
        window.open(url, '_blank');
      }
      // Revoke once the viewer has had ample time to load the image.
      runTask(this, () => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (viewer && !viewer.closed) viewer.close();
      this.notifications.error(e.message || 'Could not open the receipt');
    }
  }

  // --- Make it right (remedy) ----------------------------------------------

  @action
  openRemedy(row) {
    this.remedyAnchor = {
      source: row.source,
      paymentId: row.id,
      amountMinor: row.amount,
      currency: row.currency,
      dateLabel: this.formatDate(row.date),
    };
    this.remedyKind = 'discount_next_bill';
    this.remedyScope = 'partial';
    this.remedyAmount = '';
    this.remedyWhy = '';
    this.remedyModalOpen = true;
  }

  @action
  closeRemedy() {
    if (this.remedyBusy) return;
    this.remedyModalOpen = false;
  }

  @action
  setRemedyKind(kind) {
    this.remedyKind = kind;
  }

  @action
  setRemedyScope(scope) {
    this.remedyScope = scope;
  }

  @action
  setRemedyField(field, event) {
    this[field] = event.target.value;
  }

  @action
  async submitRemedy() {
    if (this.remedyBusy || !this.remedyAnchor) return;
    const currency = this.remedyAnchor.currency;
    const anchorAmount = this.remedyAnchor.amountMinor;

    if (!this.remedyWhy.trim()) {
      this.notifications.error('The "why" note is required.');
      return;
    }

    const body = {
      source: this.remedyAnchor.source,
      paymentId: this.remedyAnchor.paymentId,
      remedy: this.remedyKind,
      whyNote: this.remedyWhy.trim(),
    };

    if (this.remedyKind === 'refund') {
      body.scope = this.remedyScope;
      if (this.remedyScope === 'partial') {
        const amount = this.toMinor(this.remedyAmount, currency);
        if (amount == null || amount < 1 || amount > anchorAmount) {
          this.notifications.error(
            'Enter a partial amount up to the payment total.',
          );
          return;
        }
        body.amount = amount;
      }
    } else {
      const amount = this.toMinor(this.remedyAmount, currency);
      if (amount == null || amount < 1 || amount > anchorAmount) {
        this.notifications.error(
          'Enter a discount amount up to the payment total.',
        );
        return;
      }
      body.amount = amount;
    }

    this.remedyBusy = true;
    try {
      await this.auth.fetchJson('/console/remedies', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(
        this.remedyKind === 'refund' ? 'Refund initiated' : 'Discount applied',
      );
      this.remedyModalOpen = false;
      await this.reloadPayments();
      if (this.historyLoaded) this.reloadHistory();
    } catch (e) {
      this.notifications.error(e.message || 'Could not apply the remedy');
    } finally {
      this.remedyBusy = false;
    }
  }

  // --- History --------------------------------------------------------------

  async loadHistory() {
    const token = this.loadToken;
    this.historyLoading = true;
    try {
      const res = await this.auth.fetchJson(
        `/console/companies/${this.detail.id}/history?limit=100`,
      );
      if (token !== this.loadToken) return;
      this.historyRows = (res?.data?.data ?? []).map((row) => ({
        id: row.id,
        when: row.createdAt,
        who: row.newValue?.operator || row.user?.email || 'system',
        what: this.describeHistory(row),
      }));
      this.historyLoaded = true;
    } catch (e) {
      if (token === this.loadToken)
        this.notifications.error(e.message || 'Could not load history');
    } finally {
      if (token === this.loadToken) this.historyLoading = false;
    }
  }

  reloadHistory() {
    this.historyLoaded = false;
    return this.loadHistory();
  }

  describeHistory(row) {
    const event = row.newValue?.event;
    const base = HISTORY_EVENTS[event];
    if (base) {
      if (row.newValue?.amount && row.newValue?.currency) {
        return `${base} · ${this.formatMoney(
          row.newValue.amount,
          row.newValue.currency,
        )}`;
      }
      return base;
    }
    return `${row.action} ${row.entityType}`;
  }

  // --- Number + date helpers ------------------------------------------------

  minorDigits(currency) {
    const code = (currency || 'usd').toUpperCase();
    try {
      const fmt = new Intl.NumberFormat(navigator.language || 'en', {
        style: 'currency',
        currency: code,
      });
      return fmt.resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      return 2;
    }
  }

  /** Major-unit input to minor units; null when the input is not a number. */
  toMinor(major, currency) {
    if (major === '' || major === null || major === undefined) return null;
    const num = Number(major);
    if (Number.isNaN(num)) return null;
    return Math.round(num * 10 ** this.minorDigits(currency));
  }

  toMajor(minor, currency) {
    const num = Number(minor ?? 0);
    return num / 10 ** this.minorDigits(currency);
  }

  formatMoney(minor, currency) {
    const code = (currency || 'usd').toUpperCase();
    const num = Number(minor ?? 0);
    try {
      const fmt = new Intl.NumberFormat(navigator.language || 'en', {
        style: 'currency',
        currency: code,
      });
      const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
      return fmt.format(num / 10 ** digits);
    } catch {
      return `${code} ${(num / 100).toFixed(2)}`;
    }
  }

  formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(navigator.language || 'en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
