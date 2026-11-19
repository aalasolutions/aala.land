// Switcher badge text; null when the item defines no count, so 0 still renders.
export function formatCount(count, locale) {
  if (count === undefined || count === null) return null;
  return new Intl.NumberFormat(locale || navigator.language).format(count);
}
