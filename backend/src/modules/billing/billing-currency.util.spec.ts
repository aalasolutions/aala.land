import {
  BILLING_CURRENCIES,
  isBillingCurrency,
  resolveBillingCurrency,
} from './billing-currency.util';

describe('BILLING_CURRENCIES', () => {
  it('is USD-first (the checkout default) and holds the three supported currencies', () => {
    expect(BILLING_CURRENCIES).toEqual(['usd', 'aed', 'sar']);
  });
});

describe('isBillingCurrency', () => {
  it('accepts the supported currencies', () => {
    expect(isBillingCurrency('usd')).toBe(true);
    expect(isBillingCurrency('aed')).toBe(true);
    expect(isBillingCurrency('sar')).toBe(true);
  });

  it('rejects unsupported or wrong-case values', () => {
    expect(isBillingCurrency('eur')).toBe(false);
    expect(isBillingCurrency('USD')).toBe(false);
    expect(isBillingCurrency('')).toBe(false);
  });
});

describe('resolveBillingCurrency (fallback-only default)', () => {
  it('returns aed for a UAE region (dubai)', () => {
    expect(resolveBillingCurrency('dubai')).toBe('aed');
  });

  it('returns aed for another UAE region (abu-dhabi)', () => {
    expect(resolveBillingCurrency('abu-dhabi')).toBe('aed');
  });

  it('returns sar for a Saudi region (riyadh)', () => {
    expect(resolveBillingCurrency('riyadh')).toBe('sar');
  });

  it('returns sar for another Saudi region (makkah)', () => {
    expect(resolveBillingCurrency('makkah')).toBe('sar');
  });

  it('returns usd for a non-AE non-SA region (capital-kw / Kuwait)', () => {
    expect(resolveBillingCurrency('capital-kw')).toBe('usd');
  });

  it('returns usd for null', () => {
    expect(resolveBillingCurrency(null)).toBe('usd');
  });

  it('returns usd for undefined', () => {
    expect(resolveBillingCurrency(undefined)).toBe('usd');
  });

  it('returns usd for an unrecognised region code', () => {
    expect(resolveBillingCurrency('atlantis')).toBe('usd');
  });
});
