import { DateTime } from 'luxon';

// The only frontend file allowed to import luxon; only plain values leave it.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Rejects impossible days such as 2026-02-31 instead of rolling them over.
function parseDateOnly(value, zone) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return null;
  const date = DateTime.fromISO(value, { zone });
  return date.isValid ? date : null;
}

// A falsy locale keeps the browser default locale.
function withLocale(date, locale) {
  return locale ? date.setLocale(locale) : date;
}

// Strings parse as ISO, never via the Date constructor, which coerces junk into a real date.
function toDateTime(value) {
  let result;
  if (value instanceof Date) result = DateTime.fromJSDate(value);
  else if (typeof value === 'number') result = DateTime.fromMillis(value);
  else {
    const text = String(value);
    // A bare YYYY-MM-DD stays UTC midnight; Luxon would otherwise shift it to the browser zone.
    result = DATE_ONLY.test(text)
      ? DateTime.fromISO(text, { zone: 'utc' })
      : DateTime.fromISO(text);
  }
  return result.isValid ? result : null;
}

export function isDateOnly(value) {
  return parseDateOnly(value, 'utc') !== null;
}

export function browserTimeZone() {
  return DateTime.local().zoneName;
}

export function localDateString(date = new Date()) {
  return toDateTime(date)?.toISODate() ?? null;
}

// Today's YYYY-MM-DD in timeZone; browser-local when the zone is missing or invalid.
export function todayInZone(timeZone, now = new Date()) {
  const local = toDateTime(now);
  if (!local) return null;
  const zoned = timeZone ? local.setZone(timeZone) : local;
  return (zoned.isValid ? zoned : local).toISODate();
}

// Calendar arithmetic on a YYYY-MM-DD value; no zone is involved.
export function addCalendarDays(date, days) {
  const parsed = parseDateOnly(date, 'utc');
  return parsed ? parsed.plus({ days }).toISODate() : null;
}

export const DEFAULT_RANGE = 'thisMonth';

export const RANGES = ['last7', 'last30', 'thisMonth', 'lastMonth', 'custom'];

export function isKnownRange(range) {
  return RANGES.includes(range);
}

// Named period to inclusive YYYY-MM-DD bounds, pivoted on timeZone; null for 'custom'/unknown/invalid.
export function rangeBounds(range, now = new Date(), timeZone = null) {
  const local = toDateTime(now);
  if (!local) return null;
  const zoned = timeZone ? local.setZone(timeZone) : local;
  const today = (zoned.isValid ? zoned : local).startOf('day');
  if (range === 'last7') {
    return {
      from: today.minus({ days: 6 }).toISODate(),
      to: today.toISODate(),
    };
  }
  if (range === 'last30') {
    return {
      from: today.minus({ days: 29 }).toISODate(),
      to: today.toISODate(),
    };
  }
  if (range === 'lastMonth') {
    const previous = today.minus({ months: 1 });
    return {
      from: previous.startOf('month').toISODate(),
      to: previous.endOf('month').toISODate(),
    };
  }
  if (range === 'thisMonth') {
    return {
      from: today.startOf('month').toISODate(),
      to: today.endOf('month').toISODate(),
    };
  }
  return null;
}

// Bounds for any range; an unknown range or an incomplete custom pair falls back to the preset.
export function resolveRange(
  range,
  from,
  to,
  now = new Date(),
  timeZone = null,
) {
  if (range === 'custom' && isDateOnly(from) && isDateOnly(to)) {
    return from <= to ? { from, to } : { from: to, to: from };
  }
  return (
    rangeBounds(range, now, timeZone) ??
    rangeBounds(DEFAULT_RANGE, now, timeZone)
  );
}

function zoneOrLocal(timeZone) {
  return timeZone && DateTime.now().setZone(timeZone).isValid
    ? timeZone
    : 'local';
}

// ISO instant of midnight of a YYYY-MM-DD date in timeZone (browser-local without one), shifted by dayOffset days.
export function localMidnightIso(dateString, dayOffset = 0, timeZone = null) {
  const date = parseDateOnly(dateString, zoneOrLocal(timeZone));
  if (!date) return null;
  return date.plus({ days: dayOffset }).startOf('day').toUTC().toISO();
}

// ISO instant of 23:59:59.000 on a YYYY-MM-DD date in timeZone (browser-local without one).
export function localEndOfDayIso(dateString, timeZone = null) {
  const date = parseDateOnly(dateString, zoneOrLocal(timeZone));
  if (!date) return null;
  return date
    .set({ hour: 23, minute: 59, second: 59, millisecond: 0 })
    .toUTC()
    .toISO();
}

// Date part of an ISO string as written; UTC day for a Date; empty when invalid.
export function toDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const head = value.split('T')[0];
    return isDateOnly(head) ? head : '';
  }
  return toDateTime(value)?.toUTC().toISODate() ?? '';
}

// Epoch milliseconds as Date parsing gives them; YYYY-MM-DD is UTC midnight.
export function toEpochMs(value) {
  return toDateTime(value)?.toMillis() ?? NaN;
}

// Whole calendar days from today to date, both YYYY-MM-DD only (null otherwise); convert instants with todayInZone first.
export function daysUntil(date, today) {
  const target = parseDateOnly(date, 'utc');
  const from = parseDateOnly(today, 'utc');
  if (!target || !from) return null;
  return Math.round(target.diff(from, 'days').days);
}

// Short relative age such as "5m ago"; empty for a missing or invalid instant.
export function timeAgo(instant, now = Date.now()) {
  if (!instant) return '';
  const date = toDateTime(instant);
  const from = toDateTime(now);
  if (!date || !from) return '';
  const diffMins = Math.floor((from.toMillis() - date.toMillis()) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

// A YYYY-MM-DD value is a calendar date, so it is rendered in UTC to avoid a timezone shift.
export function formatCalendarDate(value, locale, options = {}) {
  if (!value) return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const date = parseDateOnly(value, 'utc');
    return date ? withLocale(date, locale).toLocaleString(options) : null;
  }
  const date = toDateTime(value);
  return date ? withLocale(date, locale).toLocaleString(options) : null;
}

// A calendar range such as "14–20 Sep", rendered in UTC so neither end shifts a day.
export function formatCalendarRange(from, to, locale, { todayZone, now } = {}) {
  const start = parseDateOnly(from, 'utc');
  const end = parseDateOnly(to, 'utc');
  if (!start || !end) return null;
  const year = currentYear(todayZone, now);
  const head = dayParts(start, locale);
  const tail = dayParts(end, locale);
  const showYear = start.year !== year || end.year !== year;
  const suffix = showYear ? ` ${tail.year}` : '';
  if (start.hasSame(end, 'day')) return `${tail.day} ${tail.month}${suffix}`;
  if (start.hasSame(end, 'month')) {
    return `${head.day}–${tail.day} ${tail.month}${suffix}`;
  }
  if (start.hasSame(end, 'year')) {
    return `${head.day} ${head.month} – ${tail.day} ${tail.month}${suffix}`;
  }
  return `${head.day} ${head.month} ${head.year} – ${tail.day} ${tail.month} ${tail.year}`;
}

// An instant in browser time, or in timeZone when given, with plain spaces; null if invalid.
export function formatInstant(value, locale, options = {}, timeZone = null) {
  if (!value) return null;
  let date = toDateTime(value);
  if (date && timeZone) date = date.setZone(timeZone);
  if (!date?.isValid) return null;
  return withLocale(date, locale).toLocaleString(options).replace(/\s/g, ' ');
}

const DAY_PARTS = { day: 'numeric', month: 'short', year: 'numeric' };
const TIME = { hour: 'numeric', minute: '2-digit' };
const TIME_WITH_SECONDS = { ...TIME, second: '2-digit' };

function currentYear(todayZone, now) {
  return Number(todayInZone(todayZone, now)?.slice(0, 4));
}

function dayParts(date, locale) {
  const parts = {};
  for (const { type, value } of withLocale(date, locale).toLocaleParts(
    DAY_PARTS,
  )) {
    parts[type] = value;
  }
  return parts;
}

// Day first with a short month; the year only when it is not the current year in todayZone.
function compactDay(date, locale, todayZone, now) {
  const { day, month, year } = dayParts(date, locale);
  return date.year === currentYear(todayZone, now)
    ? `${day} ${month}`
    : `${day} ${month} ${year}`;
}

function compactTime(date, locale, withSeconds) {
  return withLocale(date, locale)
    .toLocaleString(withSeconds ? TIME_WITH_SECONDS : TIME)
    .replace(/\s/g, ' ');
}

// A YYYY-MM-DD value stays on its own day; an instant moves to timeZone, else browser time.
function displayDate(value, timeZone) {
  if (!value) return null;
  const date = toDateTime(value);
  if (!date) return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) return date;
  const zoned = timeZone ? date.setZone(timeZone) : date;
  return zoned.isValid ? zoned : null;
}

// Display date such as "22 Sep" or "22 Sep 2025"; null if invalid.
export function formatShortDate(
  value,
  { locale, timeZone, todayZone, now } = {},
) {
  const date = displayDate(value, timeZone);
  return date ? compactDay(date, locale, todayZone, now) : null;
}

// Display date and time such as "22 Sep, 7:05 PM"; null if invalid.
export function formatShortDateTime(
  value,
  { locale, timeZone, todayZone, now, withSeconds } = {},
) {
  const date = displayDate(value, timeZone);
  if (!date) return null;
  return `${compactDay(date, locale, todayZone, now)}, ${compactTime(date, locale, withSeconds)}`;
}

// Display time such as "7:05 PM"; null if invalid.
export function formatShortTime(value, { locale, timeZone, withSeconds } = {}) {
  const date = displayDate(value, timeZone);
  return date ? compactTime(date, locale, withSeconds) : null;
}

// Browser time (or timeZone) plus the region time, dated only when its day differs: "22 Sep, 7:05 PM (Makkah 6:05 PM)".
export function formatDualZoneDateTime(
  value,
  regionName,
  regionZone,
  { locale, timeZone, todayZone, now, withSeconds } = {},
) {
  const local = displayDate(value, timeZone);
  if (!local) return null;
  const main = formatShortDateTime(value, {
    locale,
    timeZone,
    todayZone,
    now,
    withSeconds,
  });
  const regional = regionZone ? local.setZone(regionZone) : null;
  if (!regional?.isValid) return main;
  const time = compactTime(regional, locale, withSeconds);
  if (regional.toISODate() !== local.toISODate()) {
    return `${main} (${regionName} ${compactDay(regional, locale, todayZone, now)}, ${time})`;
  }
  if (time === compactTime(local, locale, withSeconds)) return main;
  return `${main} (${regionName} ${time})`;
}
