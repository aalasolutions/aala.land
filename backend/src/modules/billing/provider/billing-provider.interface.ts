import type { NormalizedBillingEvent } from '../events/billing-events';

export type BillingPriceKind = 'SEAT' | 'ENTERPRISE_BASE';
export type BillingPlan = 'PRO' | 'ENTERPRISE';

export interface EnsureCustomerInput {
    companyId: string;
    companyName: string;
    email?: string | null;
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

export interface BillingProvider {
    /** Create a customer with the company in metadata; returns the provider customer id. */
    ensureCustomer(input: EnsureCustomerInput): Promise<string>;

    /** Create a recurring monthly Price for (kind, currency, amount); returns the provider price id. */
    ensurePrice(kind: BillingPriceKind, currency: string, unitAmount: number): Promise<string>;

    /** Verify the signature and translate the raw webhook into normalized events. Throws on bad signature. */
    parseWebhook(rawBody: Buffer, signature: string): Promise<ProviderWebhookEvent>;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
