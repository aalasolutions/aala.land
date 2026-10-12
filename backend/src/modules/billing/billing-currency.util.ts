import { getRegionByCode } from '@shared/constants/regions';

/** Supported billing currencies; USD is default, listed first. */
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

/** Digits after the decimal point of a currency's minor unit: USD 2, JPY 0, BHD 3. */
export function currencyMinorDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}
