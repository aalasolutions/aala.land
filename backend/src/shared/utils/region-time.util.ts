import { getRegionByCode, REGIONS } from '../constants/regions';

export const FALLBACK_TIMEZONE = 'UTC';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function regionTimezone(regionCode?: string | null): string {
  return (
    (regionCode && getRegionByCode(regionCode)?.timezone) || FALLBACK_TIMEZONE
  );
}

/** Calendar date (YYYY-MM-DD) of an instant as seen in the given IANA zone. */
export function dateInZone(timeZone: string, at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function regionToday(regionCode?: string | null, at?: Date): string {
  return dateInZone(regionTimezone(regionCode), at);
}

export function hourInZone(timeZone: string, at: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  return Number(hour);
}

export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value);
}

/** Pure calendar arithmetic; no zone is involved. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole calendar days from one date to another. */
export function daysBetween(from: string, to: string): number {
  const toUtc = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
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

/** Region codes whose local clock currently shows the given hour. */
function minutesOfDayInZone(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return get('hour') * 60 + get('minute');
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
