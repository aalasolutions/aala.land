import { helper } from '@ember/component/helper';

/**
 * Formats a minor-unit amount (cents/fils/halalas) in its own currency.
 * Unlike {{format-currency}}, the currency is explicit per value, not the
 * active region: a billing invoice is charged in the currency pinned at
 * checkout, which can differ from the region currently being viewed.
 *
 * Usage: {{format-money row.amount row.currency}}
 */
export default helper(function formatMoney([minorAmount, currency]) {
  const num = Number(minorAmount);
  if (isNaN(num) || minorAmount === null || minorAmount === undefined) return '';

  const code = (currency || 'usd').toUpperCase();
  const locale = navigator.language || 'en';

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
    });
    // Minor-to-major divisor is currency-specific: 2 decimals for USD/AED/SAR,
    // 0 for JPY, 3 for KWD/BHD. Derive it rather than assuming /100.
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(num / 10 ** digits);
  } catch {
    return `${code} ${(num / 100).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
});
