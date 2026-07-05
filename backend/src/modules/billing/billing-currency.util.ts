import { getRegionByCode } from '@shared/constants/regions';

/**
 * Resolve the Stripe billing currency for a company based on its default region.
 *
 * Contract section 10 (frozen):
 *   AE country code  ->  'aed'
 *   SA country code  ->  'sar'
 *   anything else    ->  'usd'
 *
 * NOTE: this intentionally does NOT use Region.currency (which is the display
 * currency symbol for the UI). The billing currency is a three-letter ISO code
 * used for Stripe price selection. They happen to match for AED/SAR but must
 * stay on separate code paths so a future display-currency change does not
 * accidentally flip the billing currency.
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
