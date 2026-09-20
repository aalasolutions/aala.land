const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_ONLY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// A YYYY-MM-DD pair, or null when either end is missing or malformed. Reversed
// input is swapped rather than rejected, so a backwards range still returns rows.
export function dateRange(
  from?: string,
  to?: string,
): { from: string; to: string } | null {
  if (!from || !to) return null;
  if (!DATE_ONLY.test(from) || !DATE_ONLY.test(to)) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

// The last `count` months as 'YYYY-MM', oldest first, ending with the current one.
export function monthSeries(count: number, now = new Date()): string[] {
  const span = Math.min(Math.max(Math.trunc(count) || 1, 1), 24);
  const months: string[] = [];
  for (let back = span - 1; back >= 0; back--) {
    months.push(
      monthKey(
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)),
      ),
    );
  }
  return months;
}

export function monthKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}

// 'YYYY-MM' to its first and last day, or null when the input is not a month key.
export function monthBounds(
  month?: string,
): { from: string; to: string } | null {
  if (!month || !MONTH_KEY.test(month)) return null;
  const [year, index] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, index, 0));
  return {
    from: `${month}-01`,
    to: `${month}-${String(end.getUTCDate()).padStart(2, '0')}`,
  };
}
