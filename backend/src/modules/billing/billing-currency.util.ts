import { getRegionByCode } from '@shared/constants/regions';

/** Same value across currencies (~$25 = AED 95 = SAR 95); USD is default, listed first. */
export const BILLING_CURRENCIES = ['usd', 'aed', 'sar'] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

/** Charged when checkout names no currency, so its base price must always exist. */
export const DEFAULT_BILLING_CURRENCY: BillingCurrency = 'usd';

export function isBillingCurrency(value: string): value is BillingCurrency {
  return (BILLING_CURRENCIES as readonly string[]).includes(value);
}

/** Fallback for unpinned billingCurrency (legacy/pre-subscription); never prices checkout. */
export function resolveBillingCurrency(
  defaultRegionCode: string | null | undefined,
): string {
  if (!defaultRegionCode) return 'usd';
  const region = getRegionByCode(defaultRegionCode);
  if (!region) return 'usd';
  switch (region.country) {
    case 'AE':
      return 'aed';
    case 'SA':
      return 'sar';
    default:
      return 'usd';
  }
}
