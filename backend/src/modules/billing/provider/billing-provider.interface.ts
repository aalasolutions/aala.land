import type { NormalizedBillingEvent } from '../events/billing-events';

export type BillingPriceKind = 'SEAT' | 'ENTERPRISE_BASE';
export type BillingPlan = 'PRO' | 'ENTERPRISE';

export interface EnsureCustomerInput {
  companyId: string;
  companyName: string;
  email?: string | null;
  /** Idempotency key (from companyId) so a racing/retried create resolves to the same customer. Race audit 2026-07-07 P5. */
  idempotencyKey?: string;
}

export interface ProviderWebhookEvent {
  /** UNIQUE idempotency key (Stripe evt_...). */
  providerEventId: string;
  /** Raw provider type string. */
  providerEventType: string;
  /** Full raw event body, persisted in stripe_events.payload. */
  payload: Record<string, unknown>;
  /** Zero or more normalized internal events (billing contract section 7). */
  events: NormalizedBillingEvent[];
}

/** Inputs and results for subscription lifecycle methods. */

export interface CreateSubscriptionInput {
  /** Stripe customer id (must already exist). */
  customerId: string;
  /** BillingPrice.providerPriceId for the SEAT price ($25) in this currency. */
  seatPriceId: string;
  /** ENTERPRISE_BASE price id ($250, includes first seat), null for PRO (no base). */
  basePriceId: string | null;
  /** Target plan, stamped on subscription metadata for the webhook. */
  plan: BillingPlan;
  /** SEAT units: PRO = all active users (min 1). ENTERPRISE = active users - 1 (0 omits the seat line). */
  quantity: number;
  /** Stripe-format success URL (?session_id={CHECKOUT_SESSION_ID} appended by provider). */
  successUrl: string;
  /** Stripe-format cancel URL. */
  cancelUrl: string;
  /** Passed as subscription_data.metadata.companyId so the webhook can resolve without a DB lookup. */
  companyId: string;
}

export interface CreateSubscriptionResult {
  /** Hosted Checkout URL. Frontend redirects the user here. */
  checkoutUrl: string;
  /** Always null: real subscriptionId arrives via SubscriptionActivated webhook (single writer). */
  subscriptionId: null;
}

export interface SubscriptionRef {
  /** Provider-side subscription id. */
  subscriptionId: string;
  /** Provider-side customer id. */
  customerId: string;
}

export interface ChangePlanInput extends SubscriptionRef {
  /** Target plan. */
  plan: BillingPlan;
  /** New SEAT price id (currency is fixed at checkout, so normally unchanged). */
  seatPriceId: string;
  /** New ENTERPRISE_BASE price id; null when switching TO PRO. */
  basePriceId: string | null;
  // No quantity input: provider reads the LIVE seat line and shifts it by 1
  // (Model A). Never derive from purchasedSeats; that would break single-writer.
}

export interface BillingProvider {
  /** Create a customer with the company in metadata; returns the provider customer id. */
  ensureCustomer(input: EnsureCustomerInput): Promise<string>;

  /** Create a recurring monthly Price for (kind, currency, amount); returns the provider price id. */
  ensurePrice(
    kind: BillingPriceKind,
    currency: string,
    unitAmount: number,
  ): Promise<string>;

  /** Verify the signature and translate the raw webhook into normalized events. Throws on bad signature. */
  parseWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<ProviderWebhookEvent>;

  /** Open hosted Checkout (subscription mode). subscriptionId always arrives later via webhook. */
  createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<CreateSubscriptionResult>;

  /**
   * Read the LIVE SEAT unit count, not the DB purchasedSeats (which is webhook-synced
   * and can be stale; race audit 2026-07-07 P1). 0 for a solo ENTERPRISE.
   */
  getSeatQuantity(ref: SubscriptionRef): Promise<number>;

  /** Set SEAT units: creates the line if absent, updates in place, or deletes at 0. Immediate proration. */
  updateSeatQuantity(
    ref: SubscriptionRef,
    quantity: number,
    seatPriceId?: string,
  ): Promise<void>;

  /** PRO <-> ENTERPRISE: toggle the base line and shift the SEAT line by 1 (Model A). Immediate proration. */
  changePlan(input: ChangePlanInput): Promise<void>;

  /** Cancel at period end. SubscriptionCanceled webhook is the single writer that drops the tier to FREE. */
  cancel(ref: SubscriptionRef): Promise<void>;

  /** Read whether the subscription is scheduled to cancel at period end, and the date it takes effect. */
  getCancellationState(
    ref: SubscriptionRef,
  ): Promise<{ cancelAtPeriodEnd: boolean; cancelAt: Date | null }>;

  /** Undo a scheduled cancellation (cancel_at_period_end = false); the plan keeps renewing. */
  resume(ref: SubscriptionRef): Promise<void>;

  /**
   * Refund a past invoice payment, partial (amountMinor) or full (null).
   * Returns the provider-side refund id. "Make it right" fallback remedy.
   */
  refundInvoicePayment(
    invoiceId: string,
    amountMinor: number | null,
  ): Promise<{ refundId: string }>;

  /**
   * Credit the customer's balance so the NEXT invoice is reduced by
   * amountMinor. "Make it right" default remedy (next-bill discount).
   */
  creditCustomerBalance(
    customerId: string,
    amountMinor: number,
    currency: string,
  ): Promise<{ creditId: string }>;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
