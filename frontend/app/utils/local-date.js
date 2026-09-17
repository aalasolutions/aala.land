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

function toDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const result = DateTime.fromJSDate(date);
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

// An instant in browser time, or in timeZone when given, with plain spaces; null if invalid.
export function formatInstant(value, locale, options = {}, timeZone = null) {
  if (!value) return null;
  let date = toDateTime(value);
  if (date && timeZone) date = date.setZone(timeZone);
  if (!date?.isValid) return null;
  return withLocale(date, locale).toLocaleString(options).replace(/\s/g, ' ');
}
