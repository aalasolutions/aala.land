import { BadRequestException } from '@nestjs/common';
import { businessDateSql, isDateOnly, regionToday } from './region-time.util';
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

/** SQL month bucket of a row's business date. */
export function monthBucketSql(alias: string): string {
  return `date_trunc('month', ${businessDateSql(alias)})`;
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
