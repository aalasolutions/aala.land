const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Rejects impossible days such as 2026-02-31 instead of letting Date roll them over.
function parseDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

export function isDateOnly(value) {
  return parseDateOnly(value) !== null;
}

export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ISO instant of browser-local midnight of a YYYY-MM-DD date, shifted by dayOffset days.
export function localMidnightIso(dateString, dayOffset = 0) {
  const parts = parseDateOnly(dateString);
  if (!parts) return null;
  return new Date(parts.y, parts.m - 1, parts.d + dayOffset).toISOString();
}

// A YYYY-MM-DD value is a calendar date, so it is rendered in UTC to avoid a timezone shift.
export function formatCalendarDate(value, locale, options = {}) {
  if (!value) return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const parts = parseDateOnly(value);
    if (!parts) return null;
    const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
    return date.toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, options);
}
