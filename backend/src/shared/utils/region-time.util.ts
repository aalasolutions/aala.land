import { DateTime } from 'luxon';
import { getRegionByCode, REGIONS } from '../constants/regions';

// The only backend file allowed to import luxon; only plain values leave it.

export const FALLBACK_TIMEZONE = 'UTC';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value: unknown): DateTime<true> | null {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return null;
  const date = DateTime.fromISO(value, { zone: 'utc' });
  return date.isValid && date.year >= 1 ? date : null;
}

function requireDateOnly(value: string): DateTime<true> {
  const date = parseDateOnly(value);
  if (!date) throw new RangeError(`Invalid calendar date: ${value}`);
  return date;
}

function inZone(timeZone: string, at: Date): DateTime<true> {
  const local = DateTime.fromJSDate(at, { zone: timeZone });
  if (!local.isValid) {
    throw new RangeError(`Invalid time zone or instant: ${timeZone}`);
  }
  return local;
}

export function regionTimezone(regionCode?: string | null): string {
  return (
    (regionCode && getRegionByCode(regionCode)?.timezone) || FALLBACK_TIMEZONE
  );
}

/** Calendar date (YYYY-MM-DD) of an instant as seen in the given IANA zone. */
export function dateInZone(timeZone: string, at: Date = new Date()): string {
  return inZone(timeZone, at).toISODate();
}

export function regionToday(regionCode?: string | null, at?: Date): string {
  return dateInZone(regionTimezone(regionCode), at);
}

export function hourInZone(timeZone: string, at: Date = new Date()): number {
  return inZone(timeZone, at).hour;
}

/** True only for a real calendar date in YYYY-MM-DD form. */
export function isDateOnly(value: unknown): boolean {
  return parseDateOnly(value) !== null;
}

/** Pure calendar arithmetic; no zone is involved. */
export function addDays(date: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError(`Invalid day count: ${days}`);
  }
  const result = requireDateOnly(date).plus({ days }).toISODate();
  if (!isDateOnly(result)) throw new RangeError(`Date out of range: ${days}`);
  return result;
}

/** Whole calendar days from one date to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    requireDateOnly(to).diff(requireDateOnly(from), 'days').days,
  );
}

/** True when a range covers exactly one whole calendar month. */
export function isWholeCalendarMonth(from: string, to: string): boolean {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (!start || !end) return false;
  return (
    start.day === 1 &&
    start.hasSame(end, 'month') &&
    end.day === end.daysInMonth
  );
}

/** First and last calendar day of a 'YYYY-MM' month. */
export function monthBounds(month: string): { from: string; to: string } {
  const start = requireDateOnly(`${month}-01`);
  return { from: start.toISODate(), to: start.endOf('month').toISODate() };
}

/** Midnight of the instant's calendar day in the given zone, as an instant. */
export function startOfDayInZone(
  timeZone: string,
  at: Date = new Date(),
): Date {
  return inZone(timeZone, at).startOf('day').toJSDate();
}

/** Long calendar date such as "August 20, 2026". */
export function formatDateLong(
  at: Date,
  timeZone = 'UTC',
  locale = 'en-US',
): string {
  return inZone(timeZone, at)
    .setLocale(locale)
    .toLocaleString(DateTime.DATE_FULL);
}

// An invalid Date yields an invalid Date or NaN here rather than throwing.
const utcInstant = (at: Date) => DateTime.fromJSDate(at, { zone: 'utc' });

/** Calendar months added in UTC; the day clamps to the target month end. */
export function addMonthsToInstant(at: Date, months: number): Date {
  return utcInstant(at).plus({ months }).toJSDate();
}

/** Difference in UTC calendar months, ignoring day and time. */
export function monthsBetweenInstants(from: Date, to: Date): number {
  const start = utcInstant(from);
  const end = utcInstant(to);
  return (end.year - start.year) * 12 + (end.month - start.month);
}

export function subtractDaysFromInstant(at: Date, days: number): Date {
  return utcInstant(at).minus({ days }).toJSDate();
}

const sqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** SQL CASE mapping a region_code column to its IANA zone; unknown codes fall back to UTC. */
export function regionTimezoneSql(column: string): string {
  const byZone = new Map<string, string[]>();
  for (const region of REGIONS) {
    const codes = byZone.get(region.timezone) ?? [];
    codes.push(region.code);
    byZone.set(region.timezone, codes);
  }
  const branches = [...byZone.entries()]
    .map(
      ([zone, codes]) =>
        `WHEN ${column} IN (${codes.map(sqlLiteral).join(', ')}) THEN ${sqlLiteral(zone)}`,
    )
    .join(' ');
  return `(CASE ${branches} ELSE ${sqlLiteral(FALLBACK_TIMEZONE)} END)`;
}

/** SQL date expression for "today" in the row's region. */
export function regionTodaySql(column: string): string {
  return `((now() AT TIME ZONE ${regionTimezoneSql(column)})::date)`;
}

function minutesOfDayInZone(timeZone: string, at: Date): number {
  const local = inZone(timeZone, at);
  return local.hour * 60 + local.minute;
}

/** Region codes whose local time is within the first 30 minutes of the given hour. */
export function regionCodesAtLocalHour(
  hour: number,
  at: Date = new Date(),
): string[] {
  const inWindow = new Map<string, boolean>();
  return REGIONS.filter((region) => {
    let hit = inWindow.get(region.timezone);
    if (hit === undefined) {
      const minutes = minutesOfDayInZone(region.timezone, at);
      hit = minutes >= hour * 60 && minutes < hour * 60 + 30;
      inWindow.set(region.timezone, hit);
    }
    return hit;
  }).map((region) => region.code);
}
