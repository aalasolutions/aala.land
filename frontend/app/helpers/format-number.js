import { helper } from '@ember/component/helper';

export function formatNumber([num], { decimals = 0 }) {
  if (num === null || num === undefined || num === '') return '0';
  const number = Number(num);
  if (isNaN(number)) return '0';
  return number.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default helper(formatNumber);
