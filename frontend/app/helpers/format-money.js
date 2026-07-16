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
  const major = num / 100;
  const locale = navigator.language || 'en';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
    }).format(major);
  } catch {
    return `${code} ${major.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
});
