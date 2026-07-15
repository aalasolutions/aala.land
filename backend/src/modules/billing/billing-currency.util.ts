import { getRegionByCode } from '@shared/constants/regions';

/** Supported billing currencies, all same value (~$25 = AED 95 = SAR 95). USD default, ordered default-first. */
export const BILLING_CURRENCIES = ['usd', 'aed', 'sar'] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

/** Type guard for a supported billing currency. */
export function isBillingCurrency(value: string): value is BillingCurrency {
    return (BILLING_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Fallback currency from a company's region: AE=aed, SA=sar, else usd. Not used
 * to price checkout (the user picks); only fills in when billingCurrency is
 * unpinned (legacy / pre-subscription). Read as
 * `company.billingCurrency ?? resolveBillingCurrency(company.defaultRegionCode)`.
 */
export function resolveBillingCurrency(defaultRegionCode: string | null | undefined): string {
    if (!defaultRegionCode) return 'usd';
    const region = getRegionByCode(defaultRegionCode);
    if (!region) return 'usd';
    switch (region.country) {
        case 'AE': return 'aed';
        case 'SA': return 'sar';
        default:   return 'usd';
    }
}
