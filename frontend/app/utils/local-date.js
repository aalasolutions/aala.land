const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value) {
  return typeof value === 'string' && DATE_ONLY.test(value);
}

export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ISO instant of browser-local midnight of a YYYY-MM-DD date, shifted by dayOffset days.
export function localMidnightIso(dateString, dayOffset = 0) {
  if (!isDateOnly(dateString)) return null;
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d + dayOffset);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// A YYYY-MM-DD value is a calendar date, so it is rendered in UTC to avoid a timezone shift.
export function formatCalendarDate(value, locale, options = {}) {
  if (!value) return null;
  if (isDateOnly(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, options);
}
