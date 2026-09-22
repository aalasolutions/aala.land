import { formatMoney, pluralDays } from './money.util';

describe('formatMoney', () => {
  // Intl separates the code from the number with a non-breaking space, U+00A0.
  it('formats with the currency code, grouping and two decimals', () => {
    expect(formatMoney(15000, 'AED')).toBe('AED 15,000.00');
    expect(formatMoney(1234.5, 'SAR')).toBe('SAR 1,234.50');
  });

  it('honours a currency with no minor unit', () => {
    expect(formatMoney(15000, 'PKR')).toBe('PKR 15,000');
  });

  // Decimal columns arrive as strings from the driver.
  it('accepts the string the database returns', () => {
    expect(formatMoney('20000.00', 'AED')).toBe('AED 20,000.00');
  });

  it('returns empty for a value that is not a number', () => {
    expect(formatMoney('abc', 'AED')).toBe('');
  });

  it('falls back when the currency code is not real', () => {
    expect(formatMoney(10, 'NOTACURRENCY')).toBe('NOTACURRENCY 10.00');
  });
});

describe('pluralDays', () => {
  it('uses the singular for one day only', () => {
    expect(pluralDays(1)).toBe('1 day');
    expect(pluralDays(0)).toBe('0 days');
    expect(pluralDays(24)).toBe('24 days');
  });
});
