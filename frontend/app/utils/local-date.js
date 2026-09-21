import { DateTime } from 'luxon';

// The only frontend file allowed to import luxon; only plain values leave it.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

// ISO instant of browser-local midnight of a YYYY-MM-DD date, shifted by dayOffset days.
export function localMidnightIso(dateString, dayOffset = 0) {
  const date = parseDateOnly(dateString, 'local');
  if (!date) return null;
  return date.plus({ days: dayOffset }).startOf('day').toUTC().toISO();
}

// ISO instant of 23:59:59.000 browser-local time on a YYYY-MM-DD date.
export function localEndOfDayIso(dateString) {
  const date = parseDateOnly(dateString, 'local');
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

// Whole days until an instant, rounded up; null when the instant is missing or invalid.
export function daysUntil(instant, now = Date.now()) {
  if (!instant) return null;
  const target = toDateTime(instant);
  const from = toDateTime(now);
  if (!target || !from) return null;
  return Math.ceil((target.toMillis() - from.toMillis()) / MS_PER_DAY);
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

// A calendar range such as "Sep 14-20", rendered in UTC so neither end shifts a day.
export function formatCalendarRange(from, to, locale, options = {}) {
  const start = parseDateOnly(from, 'utc');
  const end = parseDateOnly(to, 'utc');
  if (!start || !end) return null;
  const formatter = new Intl.DateTimeFormat(locale || undefined, {
    ...options,
    timeZone: 'UTC',
  });
  // Older engines without formatRange: match how ICU renders a range, including a single day.
  if (typeof formatter.formatRange !== 'function') {
    const head = formatter.format(start.toJSDate());
    const tail = formatter.format(end.toJSDate());
    return head === tail ? head : `${head} – ${tail}`;
  }
  return formatter.formatRange(start.toJSDate(), end.toJSDate());
}

// An instant in browser time, or in timeZone when given, with plain spaces; null if invalid.
export function formatInstant(value, locale, options = {}, timeZone = null) {
  if (!value) return null;
  let date = toDateTime(value);
  if (date && timeZone) date = date.setZone(timeZone);
  if (!date?.isValid) return null;
  return withLocale(date, locale).toLocaleString(options).replace(/\s/g, ' ');
}
