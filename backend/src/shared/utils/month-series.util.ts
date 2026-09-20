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
    const point = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1),
    );
    const month = String(point.getUTCMonth() + 1).padStart(2, '0');
    months.push(`${point.getUTCFullYear()}-${month}`);
  }
  return months;
}
