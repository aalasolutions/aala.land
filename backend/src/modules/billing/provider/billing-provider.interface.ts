import type { NormalizedBillingEvent } from '../events/billing-events';

export type BillingPriceKind = 'SEAT' | 'ENTERPRISE_BASE';
export type BillingPlan = 'PRO' | 'ENTERPRISE';

export interface EnsureCustomerInput {
    companyId: string;
    companyName: string;
    email?: string | null;
    /**
     * Provider idempotency key so a retried/racing create resolves to the SAME
     * customer instead of a duplicate (race audit 2026-07-07, P5). Derived from
     * the companyId by the caller.
     */
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
    /** BillingPrice.providerPriceId for the SEAT price in this currency. */
    seatPriceId: string;
    /** BillingPrice.providerPriceId for the ENTERPRISE_BASE flat fee (ENTERPRISE only, null for PRO). */
    basePriceId: string | null;
    /** Number of seats. Must be >= 1. */
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
    /**
     * null on Checkout mode: the real subscriptionId arrives via the
     * SubscriptionActivated webhook event. Persist it there (single writer).
     */
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
    /** New SEAT price id (may differ from current if currency changed — contract: currency fixed at checkout). */
    seatPriceId: string;
    /** New ENTERPRISE_BASE price id; null when switching TO PRO. */
    basePriceId: string | null;
    // Seat quantity is intentionally NOT an input here (contract section 12: the
    // PRO<->ENTERPRISE switch preserves quantity). The provider reads the LIVE
    // quantity off the subscription it already retrieves and carries it over,
    // rather than trusting a DB-derived value: purchasedSeats is a webhook-synced
    // read model, and re-asserting it here would invert the single-writer rule
    // and could clobber an in-flight seat change whose webhook has not landed yet.
}

export interface BillingProvider {
    /** Create a customer with the company in metadata; returns the provider customer id. */
    ensureCustomer(input: EnsureCustomerInput): Promise<string>;

    /** Create a recurring monthly Price for (kind, currency, amount); returns the provider price id. */
    ensurePrice(kind: BillingPriceKind, currency: string, unitAmount: number): Promise<string>;

    /** Verify the signature and translate the raw webhook into normalized events. Throws on bad signature. */
    parseWebhook(rawBody: Buffer, signature: string): Promise<ProviderWebhookEvent>;

    /**
     * Open a hosted Stripe Checkout session (subscription mode). Returns the URL
     * to redirect the user to. subscriptionId is always null: it arrives via the
     * SubscriptionActivated webhook event after the user completes checkout.
     */
    createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;

    /**
     * Read the LIVE seat quantity from the subscription's SEAT line item. Every
     * seat mutation derives its target from this authoritative value ± the exact
     * delta, never from the webhook-synced (and possibly stale) purchasedSeats
     * column (race audit 2026-07-07, P1). Throws if the SEAT item is not found.
     */
    getSeatQuantity(ref: SubscriptionRef): Promise<number>;

    /**
     * Update the seat quantity on an existing subscription's SEAT line item.
     * Used by the unit-4 seat-add flow. Proration is immediate.
     */
    updateSeatQuantity(ref: SubscriptionRef, quantity: number): Promise<void>;

    /**
     * Swap the subscription's price items for a plan change (PRO <-> ENTERPRISE).
     * Quantity is preserved. The plan swap takes effect at next period unless the
     * provider supports immediate proration (Stripe does).
     */
    changePlan(input: ChangePlanInput): Promise<void>;

    /**
     * Cancel the subscription at the end of the current period
     * (cancel_at_period_end = true). The SubscriptionCanceled webhook fires when
     * the period ends and is the SINGLE WRITER that drops the tier to FREE.
     */
    cancel(ref: SubscriptionRef): Promise<void>;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
