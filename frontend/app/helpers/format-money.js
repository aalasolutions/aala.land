import { helper } from '@ember/component/helper';

// Currency is explicit per value: invoices bill in the currency pinned at checkout.
export default helper(function formatMoney([minorAmount, currency]) {
  const num = Number(minorAmount);
  if (isNaN(num) || minorAmount === null || minorAmount === undefined)
    return '';

  const code = (currency || 'usd').toUpperCase();
  const locale = navigator.language || 'en';

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
    });
    // Minor-to-major divisor is currency-specific; derive it rather than assuming /100.
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(num / 10 ** digits);
  } catch {
    return `${code} ${(num / 100).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
});
