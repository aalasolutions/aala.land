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

export interface ProviderWebhookEvent {
  /** UNIQUE idempotency key (Stripe evt_...). */
  providerEventId: string;
  providerEventType: string;
  /** Full raw event body, persisted in stripe_events.payload. */
  payload: Record<string, unknown>;
  events: NormalizedBillingEvent[];
}

export interface CreateSubscriptionInput {
  /** Stripe customer id (must already exist). */
  customerId: string;
  /** BillingPrice.providerPriceId for the SEAT price ($25) in this currency. */
  seatPriceId: string;
  /** ENTERPRISE_BASE price id ($250, includes first seat), null for PRO (no base). */
  basePriceId: string | null;
  /** Target plan, stamped on subscription metadata for the webhook. */
  plan: BillingPlan;
  /** SEAT units: PRO = active users (min 1); ENTERPRISE = active users minus 1 (0 omits line). */
  quantity: number;
  /** Stripe-format success URL (?session_id={CHECKOUT_SESSION_ID} appended by provider). */
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

export interface BillingProvider {
  /** Create a customer with the company in metadata; returns the provider customer id. */
  ensureCustomer(input: EnsureCustomerInput): Promise<string>;

  /** Creates a recurring monthly Price for (kind, currency, amount); returns the price id. */
  ensurePrice(
    kind: BillingPriceKind,
    currency: string,
    unitAmount: number,
  ): Promise<string>;

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

  /** Sets SEAT units: creates, updates in place, or deletes at 0. Immediate proration. */
  updateSeatQuantity(
    ref: SubscriptionRef,
    quantity: number,
    seatPriceId?: string,
  ): Promise<void>;

  /** PRO/ENTERPRISE: toggles base line, shifts SEAT line by 1 (Model A). Immediate proration. */
  changePlan(input: ChangePlanInput): Promise<void>;

  /** Cancels at period end; SubscriptionCanceled webhook alone drops tier to FREE. */
  cancel(ref: SubscriptionRef): Promise<void>;

  getCancellationState(
    ref: SubscriptionRef,
  ): Promise<{ cancelAtPeriodEnd: boolean; cancelAt: Date | null }>;

  /** Undo a scheduled cancellation (cancel_at_period_end = false); the plan keeps renewing. */
  resume(ref: SubscriptionRef): Promise<void>;

  /** Fallback remedy: partial refund via amountMinor, full refund when null. */
  refundInvoicePayment(
    invoiceId: string,
    amountMinor: number | null,
  ): Promise<{ refundId: string }>;

  /** Default remedy: credits customer balance so the NEXT invoice is reduced by amountMinor. */
  creditCustomerBalance(
    customerId: string,
    amountMinor: number,
    currency: string,
  ): Promise<{ creditId: string }>;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
