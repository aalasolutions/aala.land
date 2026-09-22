// Mirrors the frontend format-currency helper so a notification reads like the page.
export function formatMoney(
  amount: number | string,
  currency: string,
  locale = 'en-US',
): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function pluralDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
