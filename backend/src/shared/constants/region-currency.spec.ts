import { regionCurrency } from './regions';
import { regionCurrencySql } from '../utils/region-time.util';

describe('regionCurrency', () => {
  it('reads the currency off the region', () => {
    expect(regionCurrency('dubai')).toBe('AED');
    expect(regionCurrency('makkah')).toBe('SAR');
    expect(regionCurrency('punjab')).toBe('PKR');
    expect(regionCurrency('cairo')).toBe('EGP');
  });

  it('falls back for an unknown or missing region', () => {
    expect(regionCurrency('not-a-region')).toBe('USD');
    expect(regionCurrency(null)).toBe('USD');
    expect(regionCurrency(undefined)).toBe('USD');
  });
});

describe('regionCurrencySql', () => {
  it('maps every region to the same currency the helper returns', () => {
    const sql = regionCurrencySql('region_code');
    for (const [code, expected] of [
      ['dubai', 'AED'],
      ['makkah', 'SAR'],
      ['punjab', 'PKR'],
      ['beirut', 'LBP'],
    ] as const) {
      const branch = sql
        .split('WHEN ')
        .find((part) => part.includes(`'${code}'`));
      expect(branch).toContain(`THEN '${expected}'`);
    }
  });

  it('ends with a fallback so an unknown code cannot produce NULL', () => {
    expect(regionCurrencySql('region_code')).toContain("ELSE 'USD' END");
  });
});
