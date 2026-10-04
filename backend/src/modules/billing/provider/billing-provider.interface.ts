import type { NormalizedBillingEvent } from '../events/billing-events';

export type BillingPriceKind = 'SEAT' | 'ENTERPRISE_BASE';
export type BillingPlan = 'PRO' | 'ENTERPRISE';

export interface EnsureCustomerInput {
  companyId: string;
  companyName: string;
  email?: string | null;
  /** Idempotency key (from companyId) so a racing/retried create resolves to the same customer. */
  idempotencyKey?: string;
}

/** Custom price for a list of ISO country codes, carried on the base price. */
export interface PriceOverride {
  countryCodes: string[];
  currency: string;
  unitAmount: number;
}

export interface ProviderWebhookEvent {
  /** UNIQUE idempotency key (the provider's event id). */
  providerEventId: string;
  providerEventType: string;
  /** Full raw event body, persisted in billing_events.payload. */
  payload: Record<string, unknown>;
  events: NormalizedBillingEvent[];
}

export interface CreateSubscriptionInput {
  /** Provider customer id (must already exist). */
  customerId: string;
  /** BillingPrice.providerPriceId for the SEAT price in this currency. */
  seatPriceId: string;
  /** ENTERPRISE_BASE price id (includes first seat), null for PRO (no base). */
  basePriceId: string | null;
  /** Target plan, stamped on subscription metadata for the webhook. */
  plan: BillingPlan;
  /** SEAT units: PRO = active users (min 1); ENTERPRISE = active users minus 1 (0 omits line). */
  quantity: number;
  /** Return URL after a completed checkout; the provider may append its own query params. */
  successUrl: string;
  cancelUrl: string;
  /** Passed in metadata so the webhook can resolve companyId without a DB lookup. */
  companyId: string;
}

export interface CreateSubscriptionResult {
  /** Hosted Checkout URL. Frontend redirects the user here. */
  checkoutUrl: string;
  /** Always null: real subscriptionId arrives via SubscriptionActivated webhook (single writer). */
  subscriptionId: null;
}

export interface SubscriptionRef {
  subscriptionId: string;
  customerId: string;
}

export interface ChangePlanInput extends SubscriptionRef {
  plan: BillingPlan;
  /** New SEAT price id (currency is fixed at checkout, so normally unchanged). */
  seatPriceId: string;
  /** New ENTERPRISE_BASE price id; null when switching TO PRO. */
  basePriceId: string | null;
  // No quantity input: reads the LIVE seat line, shifts by 1. Never derive from purchasedSeats.
}

/** Payments of one billing period at the provider; minor units. */
export interface PeriodPayments {
  /** A transaction of the period completed, by card or from credit. */
  paid: boolean;
  /** A transaction of the period is past due. */
  failed: boolean;
  /** Completed transactions that charged the card, refundable by invoiceId. */
  cardPayments: {
    invoiceId: string;
    amount: number;
    currency: string;
    occurredAt: Date;
  }[];
}

/** A refund's state at the provider; reversed follows approved when the money is taken back. */
export type RefundState = 'pending' | 'approved' | 'rejected' | 'reversed';

/** Live period and next bill at the provider; minor units incl. tax. */
export interface RefundBasis {
  /** When the subscription started; payments before it belong to an earlier one. */
  startedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  /** Recurring lines at their full-period gross unit price. */
  heldLines: { quantity: number; unitGross: number }[];
  /** Prorated charges minus credits waiting for the next bill; negative is credit held. */
  pendingNextBill: number;
  /** False when the provider showed no next bill, so pendingNextBill is 0 by assumption. */
  pendingNextBillKnown: boolean;
  /** Customer credit balance available in the subscription currency. */
  creditBalance: number;
}

export interface BillingProvider {
  /** Stored on companies.billing_provider and billing_prices.provider. */
  readonly name: string;

  /** Lowercase HTTP header that carries the webhook signature. */
  readonly signatureHeader: string;

  /** Lowercase ISO-4217 currencies a base price may use; null = any. */
  readonly baseCurrencies: readonly string[] | null;

  /** True when a base price can carry custom prices for a list of countries. */
  readonly supportsCountryOverrides: boolean;

  /** True when a price can state whether tax is inside its amount. */
  readonly supportsTaxMode: boolean;

  /** True when the buyer can change the seat quantity at checkout. */
  readonly checkoutQuantityEditable: boolean;

  /** True when a downgrade cancels at once with a refund; false cancels at period end. */
  readonly supportsImmediateCancel: boolean;

  /** Lowercase ISO-4217 currencies the provider can charge in; null = any. */
  readonly supportedCurrencies: readonly string[] | null;

  /** Upper-case ISO 3166-1 alpha-2 countries a custom price may list; null = any. */
  readonly supportedCountries: readonly string[] | null;

  /** Create a customer with the company in metadata; returns the provider customer id. */
  ensureCustomer(input: EnsureCustomerInput): Promise<string>;

  /** Creates a recurring monthly Price; tax is inside the amount unless taxInclusive is false. Returns the price id. */
  ensurePrice(
    kind: BillingPriceKind,
    currency: string,
    unitAmount: number,
    overrides?: PriceOverride[],
    taxInclusive?: boolean,
  ): Promise<string>;

  /** Deactivates a superseded price; existing subscriptions keep billing on it. */
  archivePrice(priceId: string): Promise<void>;

  /** Verifies signature, translates raw webhook to normalized events; throws on bad signature. */
  parseWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<ProviderWebhookEvent>;

  /** Open hosted Checkout (subscription mode). subscriptionId always arrives later via webhook. */
  createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult>;

  /** Reads LIVE SEAT count, not the stale webhook-synced purchasedSeats; 0 for solo ENTERPRISE. */
  getSeatQuantity(ref: SubscriptionRef): Promise<number>;

  /** Sets SEAT units: creates, updates in place, or deletes at 0. settleNow settles the difference at once. */
  updateSeatQuantity(
    ref: SubscriptionRef,
    quantity: number,
    seatPriceId?: string,
    settleNow?: boolean,
  ): Promise<void>;

  /** PRO/ENTERPRISE: toggles base line, shifts SEAT line by 1 (Model A). */
  changePlan(input: ChangePlanInput): Promise<void>;

  /** Cancels at period end; SubscriptionCanceled webhook alone drops tier to FREE. */
  cancel(ref: SubscriptionRef): Promise<void>;

  getCancellationState(
    ref: SubscriptionRef,
  ): Promise<{ cancelAtPeriodEnd: boolean; cancelAt: Date | null }>;

  /** Undo a scheduled cancellation (cancel_at_period_end = false); the plan keeps renewing. */
  resume(ref: SubscriptionRef): Promise<void>;

  /** Immediate-cancel adapters only. Null once the subscription has ended. */
  getRefundBasis(ref: SubscriptionRef): Promise<RefundBasis | null>;

  /** Immediate-cancel adapters only. Transactions of the billing period starting at periodStart. */
  getPeriodPayments(
    ref: SubscriptionRef,
    periodStart: Date,
  ): Promise<PeriodPayments>;

  /** Immediate-cancel adapters only. Ends the subscription now; no-op if already ended. */
  cancelImmediately(ref: SubscriptionRef): Promise<void>;

  /** Partial via amountMinor, full when null; a reference makes a retry idempotent. */
  refundInvoicePayment(
    invoiceId: string,
    amountMinor: number | null,
    reference?: string,
  ): Promise<{ refundId: string; state?: RefundState }>;

  /** Default remedy: credits customer balance so the NEXT invoice is reduced by amountMinor. */
  creditCustomerBalance(
    customerId: string,
    amountMinor: number,
    currency: string,
  ): Promise<{ creditId: string }>;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
