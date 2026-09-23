import { COUNTRY_NAMES, REGIONS, regionCurrency } from './regions';
import { dateInZone } from '../utils/region-time.util';

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

describe('REGIONS data', () => {
  it('every region carries a well-formed ISO 4217 code', () => {
    for (const region of REGIONS) {
      expect(region.currency).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('every region code is unique', () => {
    const codes = REGIONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // dateInZone throws RangeError on a zone Luxon cannot resolve, so this is a
  // real check against the IANA database rather than a string-shape assertion.
  it('every timezone resolves', () => {
    const at = new Date('2026-09-22T12:00:00Z');
    for (const region of REGIONS) {
      expect(() => dateInZone(region.timezone, at)).not.toThrow();
    }
  });

  it('every country a region names has a display name', () => {
    for (const region of REGIONS) {
      expect(COUNTRY_NAMES[region.country]).toBeDefined();
    }
  });

  it('every code is kebab-case, which the SQL builders assume', () => {
    for (const region of REGIONS) {
      expect(region.code).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});
