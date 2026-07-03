export type BillingPriceKind = 'SEAT' | 'ENTERPRISE_BASE';

export interface EnsureCustomerInput {
    companyId: string;
    companyName: string;
    email?: string | null;
}

export interface BillingProvider {
    /** Create a customer with the company in metadata; returns the provider customer id. */
    ensureCustomer(input: EnsureCustomerInput): Promise<string>;

    /** Create a recurring monthly Price for (kind, currency, amount); returns the provider price id. */
    ensurePrice(kind: BillingPriceKind, currency: string, unitAmount: number): Promise<string>;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
