import { helper } from '@ember/component/helper';

export function formatNumber([num], hash = {}) {
  const decimals = hash.decimals ?? 0;
  if (num === null || num === undefined || num === '') return '0';
  const number = Number(num);
  if (isNaN(number)) return '0';
  const locale = navigator.language || 'en';
  return number.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default helper(formatNumber);
