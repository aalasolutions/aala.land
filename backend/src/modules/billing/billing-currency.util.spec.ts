import { resolveBillingCurrency } from './billing-currency.util';

describe('resolveBillingCurrency', () => {
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
