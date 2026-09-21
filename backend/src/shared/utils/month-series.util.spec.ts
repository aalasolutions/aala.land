import { BadRequestException } from '@nestjs/common';
import {
  dateRange,
  monthBucketSql,
  monthLabelSql,
  monthSeries,
  trendAnchor,
  zeroFillMonths,
} from './month-series.util';
import { businessDateSql, dateInZone, regionToday } from './region-time.util';

describe('month-series.util', () => {
  describe('dateRange', () => {
    it('returns both ends unchanged when they are real calendar dates', () => {
      expect(dateRange('2026-02-01', '2026-02-28')).toEqual({
        from: '2026-02-01',
        to: '2026-02-28',
      });
    });

    it('accepts a leap day that exists and rejects one that does not', () => {
      expect(dateRange('2028-02-29', '2028-03-01')).toEqual({
        from: '2028-02-29',
        to: '2028-03-01',
      });
      expect(() => dateRange('2027-02-29', '2027-03-01')).toThrow(
        BadRequestException,
      );
    });

    it('swaps a reversed range instead of rejecting it', () => {
      expect(dateRange('2026-02-28', '2026-02-01')).toEqual({
        from: '2026-02-01',
        to: '2026-02-28',
      });
    });

    it('returns a single-day range when both ends are the same day', () => {
      expect(dateRange('2026-02-14', '2026-02-14')).toEqual({
        from: '2026-02-14',
        to: '2026-02-14',
      });
    });

    it('returns null only when neither end is given', () => {
      expect(dateRange(undefined, undefined)).toBeNull();
      expect(dateRange()).toBeNull();
      expect(dateRange('', '')).toBeNull();
    });

    it('rejects a half-supplied range rather than dropping the filter', () => {
      expect(() => dateRange('2026-02-01', undefined)).toThrow(
        BadRequestException,
      );
      expect(() => dateRange(undefined, '2026-02-28')).toThrow(
        BadRequestException,
      );
      expect(() => dateRange('2026-02-01', '')).toThrow(BadRequestException);
    });

    it('rejects a date the calendar does not have', () => {
      expect(() => dateRange('2026-02-31', '2026-02-28')).toThrow(
        BadRequestException,
      );
      expect(() => dateRange('2026-04-01', '2026-04-31')).toThrow(
        BadRequestException,
      );
      expect(() => dateRange('2026-06-31', '2026-06-30')).toThrow(
        BadRequestException,
      );
    });

    it('rejects a malformed end', () => {
      expect(() => dateRange('nonsense', '2026-02-28')).toThrow(
        BadRequestException,
      );
      expect(() => dateRange('2026-2-3', '2026-02-28')).toThrow(
        BadRequestException,
      );
      expect(() => dateRange('2026-13-01', '2026-02-28')).toThrow(
        BadRequestException,
      );
      expect(() => dateRange('2026-02-01T00:00:00Z', '2026-02-28')).toThrow(
        BadRequestException,
      );
      expect(() => dateRange('0000-01-01', '2026-02-28')).toThrow(
        BadRequestException,
      );
    });

    it('reports a 400, not a 500, so the range never reaches SQL', () => {
      try {
        dateRange('2026-02-31', '2026-02-28');
        fail('expected a rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getStatus()).toBe(400);
      }
    });
  });

  describe('monthSeries', () => {
    it('returns six months oldest first, ending on the anchor month', () => {
      const series = monthSeries(6, new Date('2026-09-21T10:30:00Z'));

      expect(series).toEqual([
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
      ]);
    });

    it('rolls the year over backwards from January', () => {
      expect(monthSeries(3, new Date('2026-01-15T00:00:00Z'))).toEqual([
        '2025-11',
        '2025-12',
        '2026-01',
      ]);
    });

    it('keeps the anchor month when the anchor is the last instant of it', () => {
      expect(monthSeries(2, new Date('2026-12-31T23:59:59Z'))).toEqual([
        '2026-11',
        '2026-12',
      ]);
    });

    it('clamps the span to 1..24 and truncates a fractional count', () => {
      const at = new Date('2026-03-10T00:00:00Z');

      expect(monthSeries(0, at)).toEqual(['2026-03']);
      expect(monthSeries(-5, at)).toEqual(['2026-03']);
      expect(monthSeries(Number.NaN, at)).toEqual(['2026-03']);
      expect(monthSeries(1, at)).toEqual(['2026-03']);
      expect(monthSeries(2.9, at)).toEqual(['2026-02', '2026-03']);
      expect(monthSeries(99, at)).toHaveLength(24);
      expect(monthSeries(99, at)[0]).toBe('2024-04');
      expect(monthSeries(99, at)[23]).toBe('2026-03');
    });

    it('buckets on the UTC month of the anchor instant', () => {
      const lastMomentOfDecemberUtc = new Date('2025-12-31T21:00:00Z');

      expect(monthSeries(1, lastMomentOfDecemberUtc)).toEqual(['2025-12']);
      expect(dateInZone('Asia/Dubai', lastMomentOfDecemberUtc)).toBe(
        '2026-01-01',
      );
    });

    it('ends on the region month when the caller anchors on the region day', () => {
      const at = new Date('2025-12-31T21:00:00Z');
      const regionAnchor = new Date(
        `${dateInZone('Asia/Dubai', at)}T00:00:00Z`,
      );

      expect(monthSeries(3, regionAnchor)).toEqual([
        '2025-11',
        '2025-12',
        '2026-01',
      ]);
    });

    it('ends on the current UTC month when no anchor is given', () => {
      const now = new Date();
      const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

      expect(monthSeries(1)).toEqual([expected]);
    });
  });
  describe('trendAnchor', () => {
    // Every region zone runs ahead of UTC, so a UTC anchor drops a region already in the next month.
    const boundary = new Date('2026-09-30T21:00:00.000Z');
    const dayOf = (anchor: Date) => anchor.toISOString().slice(0, 10);

    it('anchors on the newest region day when the caller reads every region', () => {
      expect(dateInZone('UTC', boundary)).toBe('2026-09-30');
      expect(dayOf(trendAnchor(null, boundary))).toBe('2026-10-01');
    });

    it('anchors on the requested region day, not the server UTC day', () => {
      expect(dayOf(trendAnchor(['dubai'], boundary))).toBe('2026-10-01');
      expect(dayOf(trendAnchor(['punjab'], boundary))).toBe('2026-10-01');
    });

    it('takes the newest day of a multi-region scope', () => {
      // Dubai is already on the next day at this instant; Cairo is not.
      const split = new Date('2026-09-30T20:30:00.000Z');

      expect(dayOf(trendAnchor(['cairo'], split))).toBe('2026-09-30');
      expect(dayOf(trendAnchor(['dubai'], split))).toBe('2026-10-01');
      expect(dayOf(trendAnchor(['cairo', 'dubai'], split))).toBe('2026-10-01');
      expect(dayOf(trendAnchor(['dubai', 'cairo'], split))).toBe('2026-10-01');
    });

    it('falls back to UTC for an unknown code and for an empty scope', () => {
      expect(dayOf(trendAnchor(['nowhere'], boundary))).toBe('2026-09-30');
      expect(dayOf(trendAnchor([], boundary))).toBe('2026-09-30');
    });

    it('ends the month series on the newest region month', () => {
      expect(monthSeries(3, trendAnchor(['dubai'], boundary))).toEqual([
        '2026-08',
        '2026-09',
        '2026-10',
      ]);
      expect(monthSeries(3, trendAnchor(['nowhere'], boundary))).toEqual([
        '2026-07',
        '2026-08',
        '2026-09',
      ]);
    });

    it('anchors on today when no instant is given', () => {
      expect(dayOf(trendAnchor([]))).toBe(regionToday(null));
    });

    it('keeps midnight UTC so the anchor cannot drift a day either way', () => {
      expect(trendAnchor(['dubai'], boundary).toISOString()).toBe(
        '2026-10-01T00:00:00.000Z',
      );
    });
  });

  describe('month bucket SQL', () => {
    it('buckets the business date, not created_at on its own', () => {
      expect(monthBucketSql('t')).toBe(
        `date_trunc('month', ${businessDateSql('t')})`,
      );
      expect(monthBucketSql('t')).toContain('COALESCE(t.transaction_date,');
    });

    it('labels months in the same form monthSeries emits', () => {
      expect(monthLabelSql('t')).toBe(
        `to_char(${monthBucketSql('t')}, 'YYYY-MM')`,
      );
      expect(
        monthSeries(2, new Date('2026-09-21T00:00:00Z')).every((month) =>
          /^\d{4}-\d{2}$/.test(month),
        ),
      ).toBe(true);
    });

    it('follows the alias it is given', () => {
      expect(monthBucketSql('txn')).toContain('txn.transaction_date');
      expect(monthBucketSql('txn')).not.toContain('t.transaction_date');
    });
  });

  describe('zeroFillMonths', () => {
    const series = ['2026-07', '2026-08', '2026-09'];

    it('turns sparse rows into one numeric point per month', () => {
      const rows = [
        { month: '2026-09', income: '5000.50', expense: '1200' },
        { month: '2026-07', income: '10', expense: '0' },
      ];

      expect(zeroFillMonths(series, rows, ['income', 'expense'])).toEqual([
        { month: '2026-07', income: 10, expense: 0 },
        { month: '2026-08', income: 0, expense: 0 },
        { month: '2026-09', income: 5000.5, expense: 1200 },
      ]);
    });

    it('keeps the series order rather than the row order', () => {
      const rows = [
        { month: '2026-09', total: '3' },
        { month: '2026-08', total: '2' },
        { month: '2026-07', total: '1' },
      ];

      expect(
        zeroFillMonths(series, rows, ['total']).map((point) => point.month),
      ).toEqual(series);
    });

    it('zeroes a missing month, a missing column and a null column', () => {
      const rows = [{ month: '2026-07', total: null }, { month: '2026-08' }];

      expect(zeroFillMonths(series, rows, ['total'])).toEqual([
        { month: '2026-07', total: 0 },
        { month: '2026-08', total: 0 },
        { month: '2026-09', total: 0 },
      ]);
    });

    it('returns a full zero series when SQL returned nothing', () => {
      expect(zeroFillMonths(series, [], ['income', 'expense'])).toEqual([
        { month: '2026-07', income: 0, expense: 0 },
        { month: '2026-08', income: 0, expense: 0 },
        { month: '2026-09', income: 0, expense: 0 },
      ]);
    });

    it('drops a row whose month is outside the series', () => {
      const rows = [
        { month: '2026-06', total: '999' },
        { month: '2026-08', total: '5' },
      ];

      expect(zeroFillMonths(series, rows, ['total'])).toEqual([
        { month: '2026-07', total: 0 },
        { month: '2026-08', total: 5 },
        { month: '2026-09', total: 0 },
      ]);
    });
  });
});
