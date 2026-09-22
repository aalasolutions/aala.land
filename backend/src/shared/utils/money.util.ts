export function formatMoney(
  amount: number | string,
  currency: string,
  locale = 'en-US',
): string {
  const isNumeric =
    typeof amount === 'number' ||
    (typeof amount === 'string' && amount.trim() !== '');
  if (!isNumeric) return '';
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
