import { BadRequestException } from '@nestjs/common';
import { addDays, isDateOnly, regionToday } from './region-time.util';
import { MAX_RANGE_DAYS } from '../constants/date-range';
import { REGIONS } from '../constants/regions';

const isRangeEnd = (value?: string): value is string => isDateOnly(value);

// A partial or unreal range is rejected, never dropped into an all-time query.
export function dateRange(
  from?: string,
  to?: string,
): { from: string; to: string } | null {
  if (!from && !to) return null;
  if (!isRangeEnd(from) || !isRangeEnd(to)) {
    throw new BadRequestException(
      'from and to must both be real calendar dates in YYYY-MM-DD format',
    );
  }
  // Reversed input is swapped, so a backwards range still returns rows.
  return from <= to ? { from, to } : { from: to, to: from };
}

// `month` is set by the month path only; consumers read it to tell the two shapes apart.
export interface BucketBounds {
  from: string;
  to: string;
  month?: string;
}

// `count` blocks of `size` days, oldest first, the last one ending on `to`.
export function dayBlockSeries(
  to: string,
  size: number,
  count: number,
): BucketBounds[] {
  const span = Math.max(Math.trunc(size) || 1, 1);
  // Clamping the span would silently stop the last block being the selected range.
  if (span > MAX_RANGE_DAYS) {
    throw new BadRequestException(
      `date range must not exceed ${MAX_RANGE_DAYS} days`,
    );
  }
  const blocks = Math.min(Math.max(Math.trunc(count) || 1, 1), 24);
  const series: BucketBounds[] = [];
  try {
    for (let back = blocks - 1; back >= 0; back--) {
      const end = addDays(to, -back * span);
      series.push({ from: addDays(end, -(span - 1)), to: end });
    }
  } catch (error) {
    // Walking back off the start of the calendar is bad input, not a server fault.
    if (error instanceof RangeError) {
      throw new BadRequestException(
        'date range starts too early to build a trend',
      );
    }
    throw error;
  }
  return series;
}

/** SQL index of a row within day blocks starting at :seriesFrom. */
export function dayBucketSql(alias: string): string {
  return `FLOOR((${moneyDateSql(alias)} - :seriesFrom::date)::numeric / :bucketSize::numeric)::int`;
}

// The last `count` months as 'YYYY-MM', oldest first, ending with the current one.
export function monthSeries(count: number, now = new Date()): string[] {
  const span = Math.min(Math.max(Math.trunc(count) || 1, 1), 24);
  const months: string[] = [];
  for (let back = span - 1; back >= 0; back--) {
    const point = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1),
    );
    const month = String(point.getUTCMonth() + 1).padStart(2, '0');
    months.push(`${point.getUTCFullYear()}-${month}`);
  }
  return months;
}

// Rows bucket in their own region day, so the series ends on the latest day in view.
export function trendAnchor(
  regionCodes: string[] | null,
  at: Date = new Date(),
): Date {
  const codes = regionCodes ?? REGIONS.map((region) => region.code);
  // An unknown or unmatched region_code buckets in UTC in SQL, so UTC is always in the set.
  const latest = codes.reduce(
    (newest, code) => {
      const day = regionToday(code, at);
      return day > newest ? day : newest;
    },
    regionToday(null, at),
  );
  return new Date(`${latest}T00:00:00Z`);
}

/** SQL column holding the day the money arrived. */
export function moneyDateSql(alias: string): string {
  return `${alias}.transaction_date`;
}

/** SQL month bucket of the day the money arrived. */
export function monthBucketSql(alias: string): string {
  return `date_trunc('month', ${moneyDateSql(alias)})`;
}

/** SQL month label in the same 'YYYY-MM' form monthSeries emits, so the two join up. */
export function monthLabelSql(alias: string): string {
  return `to_char(${monthBucketSql(alias)}, 'YYYY-MM')`;
}

type MonthRow<K extends string> = { month: string } & Partial<
  Record<K, string | number | null>
>;

// Sparse SQL rows become one point per month, so a gap in the data cannot shorten the series.
export function zeroFillMonths<K extends string>(
  series: string[],
  rows: ReadonlyArray<MonthRow<K>>,
  keys: readonly K[],
): Array<{ month: string } & Record<K, number>> {
  const found = new Map(rows.map((row) => [row.month, row]));
  return series.map((month) => {
    const row = found.get(month);
    const totals = {} as Record<K, number>;
    for (const key of keys) {
      totals[key] = Number(row?.[key] ?? 0);
    }
    return { month, ...totals };
  });
}

type BucketRow<K extends string> = { bucket: string | number } & Partial<
  Record<K, string | number | null>
>;

// Sparse SQL rows become one point per bucket, so a gap cannot shorten the series.
export function zeroFillBuckets<K extends string>(
  series: BucketBounds[],
  rows: ReadonlyArray<BucketRow<K>>,
  keys: readonly K[],
): Array<BucketBounds & Record<K, number>> {
  const found = new Map(rows.map((row) => [Number(row.bucket), row]));
  return series.map((bounds, index) => {
    const row = found.get(index);
    const totals = {} as Record<K, number>;
    for (const key of keys) {
      totals[key] = Number(row?.[key] ?? 0);
    }
    return { ...bounds, ...totals };
  });
}
