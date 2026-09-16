import { helper } from '@ember/component/helper';

// `unit` appends a noun pluralised against the count; irregular plurals pass `plural` explicitly.
export function formatNumber([num], hash = {}) {
  const decimals = hash.decimals ?? 0;
  const isEmpty = num === null || num === undefined || num === '';
  const number = isEmpty ? 0 : Number(num);
  const value = isNaN(number) ? 0 : number;
  const locale = navigator.language || 'en';
  const formatted = value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (!hash.unit) return formatted;

  const noun =
    value === 1 ? hash.unit : (hash.plural ?? `${hash.unit}s`);
  return `${formatted} ${noun}`;
}

export default helper(formatNumber);
