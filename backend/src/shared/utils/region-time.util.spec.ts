import { REGIONS } from '../constants/regions';
import {
  FALLBACK_TIMEZONE,
  addDays,
  addMonthsToInstant,
  dateInZone,
  daysBetween,
  formatDateLong,
  hourInZone,
  isDateOnly,
  isWholeCalendarMonth,
  monthBounds,
  monthsBetweenInstants,
  regionCodesAtLocalHour,
  regionTimezone,
  regionTimezoneSql,
  regionToday,
  regionTodaySql,
  startOfDayInZone,
  subtractDaysFromInstant,
} from './region-time.util';

describe('region-time.util', () => {
  describe('regionTimezone', () => {
    it('maps a known region to its IANA zone', () => {
      expect(regionTimezone('dubai')).toBe('Asia/Dubai');
      expect(regionTimezone('punjab')).toBe('Asia/Karachi');
    });

    it('falls back to UTC for unknown, empty, null and undefined codes', () => {
      expect(FALLBACK_TIMEZONE).toBe('UTC');
      expect(regionTimezone('atlantis')).toBe('UTC');
      expect(regionTimezone('')).toBe('UTC');
      expect(regionTimezone(null)).toBe('UTC');
      expect(regionTimezone(undefined)).toBe('UTC');
    });
  });

  describe('dateInZone', () => {
    it('gives different calendar days either side of the date line at one instant', () => {
      const at = new Date('2026-09-16T10:30:00Z');

      expect(dateInZone('Pacific/Kiritimati', at)).toBe('2026-09-17');
      expect(dateInZone('America/Los_Angeles', at)).toBe('2026-09-16');
      expect(dateInZone('UTC', at)).toBe('2026-09-16');
    });

    it('rolls over at local midnight, not UTC midnight', () => {
      expect(dateInZone('Asia/Dubai', new Date('2026-09-16T19:59:59Z'))).toBe(
        '2026-09-16',
      );
      expect(dateInZone('Asia/Dubai', new Date('2026-09-16T20:00:00Z'))).toBe(
        '2026-09-17',
      );
    });
  });

  describe('regionToday', () => {
    it('reads the calendar day in the region zone', () => {
      const at = new Date('2026-12-31T21:00:00Z');

      expect(regionToday('dubai', at)).toBe('2027-01-01');
      expect(regionToday(null, at)).toBe('2026-12-31');
    });
  });

  describe('hourInZone', () => {
    it('truncates a half-hour offset to the local hour', () => {
      // Asia/Kolkata is UTC+05:30.
      expect(hourInZone('Asia/Kolkata', new Date('2026-09-16T05:00:00Z'))).toBe(
        10,
      );
      expect(hourInZone('Asia/Kolkata', new Date('2026-09-16T03:29:00Z'))).toBe(
        8,
      );
      expect(hourInZone('Asia/Kolkata', new Date('2026-09-16T03:30:00Z'))).toBe(
        9,
      );
    });

    it('reports local midnight as 0, never 24', () => {
      expect(hourInZone('Asia/Kolkata', new Date('2026-09-16T18:30:00Z'))).toBe(
        0,
      );
    });
  });

  describe('isDateOnly', () => {
    it('accepts YYYY-MM-DD only', () => {
      expect(isDateOnly('2026-09-16')).toBe(true);
      expect(isDateOnly('2026-09-16T00:00:00Z')).toBe(false);
      expect(isDateOnly('2026-9-16')).toBe(false);
      expect(isDateOnly('')).toBe(false);
    });

    it('rejects impossible calendar dates and non-strings', () => {
      expect(isDateOnly('2026-02-31')).toBe(false);
      expect(isDateOnly('2026-13-01')).toBe(false);
      expect(isDateOnly('2026-02-29')).toBe(false);
      expect(isDateOnly('2028-02-29')).toBe(true);
      expect(isDateOnly('0000-01-01')).toBe(false);
      expect(isDateOnly(null)).toBe(false);
      expect(isDateOnly(20260916)).toBe(false);
    });
  });

  describe('invalid input', () => {
    it('throws instead of rolling an impossible date over', () => {
      expect(() => addDays('2026-02-31', 1)).toThrow(RangeError);
      expect(() => addDays('2026-09-16', 1e9)).toThrow(RangeError);
      expect(() => addDays('2026-09-16', 3000000)).toThrow(RangeError);
      expect(() => addDays('2026-09-16', 1.5)).toThrow(RangeError);
      expect(() => addDays('2026-09-16', NaN)).toThrow(RangeError);
      expect(() => daysBetween('2026-09-16', 'garbage')).toThrow(RangeError);
    });

    it('throws for an unknown IANA zone', () => {
      expect(() => dateInZone('Not/AZone', new Date())).toThrow(RangeError);
      expect(() => hourInZone('Not/AZone', new Date())).toThrow(RangeError);
    });
  });

  describe('addDays', () => {
    it('crosses a month end', () => {
      expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
      expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    });

    it('crosses a year end in both directions', () => {
      expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
      expect(addDays('2027-01-02', -3)).toBe('2026-12-30');
    });

    it('handles leap and non-leap February', () => {
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
      expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    });

    it('returns the same day for zero', () => {
      expect(addDays('2026-09-16', 0)).toBe('2026-09-16');
    });
  });

  describe('daysBetween', () => {
    it('counts whole calendar days, signed', () => {
      expect(daysBetween('2026-09-16', '2026-09-16')).toBe(0);
      expect(daysBetween('2026-09-16', '2026-09-19')).toBe(3);
      expect(daysBetween('2026-09-19', '2026-09-16')).toBe(-3);
    });

    it('crosses a year end and a leap day', () => {
      expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
      expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    });

    it('is not skewed by a DST change in the host zone', () => {
      expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
      expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    });
  });

  describe('regionCodesAtLocalHour', () => {
    it('includes the Dubai regions at 05:00Z and excludes other offsets', () => {
      const at = new Date('2026-09-16T05:00:00Z');
      const codes = regionCodesAtLocalHour(9, at);

      expect(codes).toContain('dubai');
      expect(codes).not.toContain('punjab');
      const expected = REGIONS.filter(
        (r) => hourInZone(r.timezone, at) === 9,
      ).map((r) => r.code);
      expect(codes).toEqual(expected);
    });

    it('reaches half-hour zones at local 09:00 on the half-hour tick, once', () => {
      const atNine = regionCodesAtLocalHour(
        9,
        new Date('2026-09-16T03:30:00Z'),
      );
      const atNineThirty = regionCodesAtLocalHour(
        9,
        new Date('2026-09-16T04:00:00Z'),
      );

      expect(atNine).toContain('andhra-pradesh');
      expect(atNineThirty).not.toContain('andhra-pradesh');
    });

    it('returns nothing when no supported zone is at that hour', () => {
      expect(
        regionCodesAtLocalHour(9, new Date('2026-09-16T12:00:00Z')),
      ).toEqual([]);
    });
  });

  describe('regionTimezoneSql', () => {
    const sql = regionTimezoneSql('c.region_code');

    it('maps the dubai code to Asia/Dubai', () => {
      expect(sql).toMatch(
        /WHEN c\.region_code IN \([^)]*'dubai'[^)]*\) THEN 'Asia\/Dubai'/,
      );
    });

    it('falls back to UTC for anything else', () => {
      expect(sql.startsWith('(CASE WHEN ')).toBe(true);
      expect(sql.endsWith(" ELSE 'UTC' END)")).toBe(true);
    });

    it('lists every region code exactly once', () => {
      for (const region of REGIONS) {
        expect(sql.split(`'${region.code}'`)).toHaveLength(2);
      }
    });
  });

  describe('startOfDayInZone', () => {
    it('returns local midnight of the instant as an instant', () => {
      const at = new Date('2026-09-16T21:15:00Z');

      expect(startOfDayInZone('UTC', at).toISOString()).toBe(
        '2026-09-16T00:00:00.000Z',
      );
      expect(startOfDayInZone('Asia/Dubai', at).toISOString()).toBe(
        '2026-09-16T20:00:00.000Z',
      );
    });
  });

  describe('formatDateLong', () => {
    it('writes the long US form on the UTC calendar day by default', () => {
      expect(formatDateLong(new Date('2026-08-20T23:59:59Z'))).toBe(
        'August 20, 2026',
      );
      expect(formatDateLong(new Date('2027-01-01T00:00:00Z'))).toBe(
        'January 1, 2027',
      );
    });

    it('uses the given zone for the calendar day', () => {
      expect(
        formatDateLong(new Date('2026-08-20T21:00:00Z'), 'Asia/Dubai'),
      ).toBe('August 21, 2026');
    });
  });

  describe('addMonthsToInstant', () => {
    it('keeps the UTC time and clamps to the target month end', () => {
      expect(
        addMonthsToInstant(new Date('2026-01-31T10:20:30.456Z'), 1),
      ).toEqual(new Date('2026-02-28T10:20:30.456Z'));
      expect(addMonthsToInstant(new Date('2027-03-31T00:00:00Z'), 11)).toEqual(
        new Date('2028-02-29T00:00:00Z'),
      );
    });

    it('goes backwards across a year end', () => {
      expect(addMonthsToInstant(new Date('2026-03-31T05:00:00Z'), -13)).toEqual(
        new Date('2025-02-28T05:00:00Z'),
      );
    });

    it('propagates an invalid Date instead of throwing', () => {
      expect(addMonthsToInstant(new Date(NaN), 1).getTime()).toBeNaN();
    });
  });

  describe('monthsBetweenInstants', () => {
    it('counts UTC calendar months, ignoring day and time', () => {
      expect(
        monthsBetweenInstants(
          new Date('2026-01-31T23:00:00Z'),
          new Date('2026-02-01T00:00:00Z'),
        ),
      ).toBe(1);
      expect(
        monthsBetweenInstants(
          new Date('2026-09-16T00:00:00Z'),
          new Date('2025-11-30T00:00:00Z'),
        ),
      ).toBe(-10);
    });
  });

  describe('subtractDaysFromInstant', () => {
    it('subtracts whole 24-hour UTC days', () => {
      expect(
        subtractDaysFromInstant(new Date('2026-03-10T12:00:00Z'), 30),
      ).toEqual(new Date('2026-02-08T12:00:00Z'));
      expect(
        subtractDaysFromInstant(new Date('2026-11-02T08:00:00Z'), 7),
      ).toEqual(new Date('2026-10-26T08:00:00Z'));
    });
  });

  describe('regionTodaySql', () => {
    it('casts now() in the row region zone to a date', () => {
      expect(regionTodaySql('c.region_code')).toBe(
        `((now() AT TIME ZONE ${regionTimezoneSql('c.region_code')})::date)`,
      );
    });
  });

  describe('isWholeCalendarMonth', () => {
    it('accepts the first to the last day of the same month', () => {
      expect(isWholeCalendarMonth('2026-02-01', '2026-02-28')).toBe(true);
      expect(isWholeCalendarMonth('2024-02-01', '2024-02-29')).toBe(true);
      expect(isWholeCalendarMonth('2026-09-01', '2026-09-30')).toBe(true);
    });

    it('refuses a partial month, a short end and a span of two months', () => {
      expect(isWholeCalendarMonth('2026-02-02', '2026-02-28')).toBe(false);
      expect(isWholeCalendarMonth('2026-02-01', '2026-02-27')).toBe(false);
      expect(isWholeCalendarMonth('2026-01-01', '2026-02-28')).toBe(false);
    });

    it('refuses the same month of a different year', () => {
      expect(isWholeCalendarMonth('2025-02-01', '2026-02-28')).toBe(false);
    });

    it('refuses anything that is not a calendar date', () => {
      expect(isWholeCalendarMonth('2026-02', '2026-02-28')).toBe(false);
      expect(isWholeCalendarMonth('2026-02-31', '2026-02-28')).toBe(false);
    });
  });

  describe('monthBounds', () => {
    it('returns the first and last day of the month', () => {
      expect(monthBounds('2026-02')).toEqual({
        from: '2026-02-01',
        to: '2026-02-28',
      });
      expect(monthBounds('2024-02')).toEqual({
        from: '2024-02-01',
        to: '2024-02-29',
      });
      expect(monthBounds('2026-12')).toEqual({
        from: '2026-12-01',
        to: '2026-12-31',
      });
    });

    it('throws on a month that is not real', () => {
      expect(() => monthBounds('2026-13')).toThrow(RangeError);
    });
  });
});
