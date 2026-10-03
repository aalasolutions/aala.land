const COMPACT_FROM = 1_000_000;
const cache = new Map();

function cachedFormatter(locale, currency, options) {
  const key = `${locale}|${currency}|${JSON.stringify(options)}`;
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...options,
    });
    cache.set(key, formatter);
  }
  return formatter;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

// No currency or a rejected code: plain digits.
function plain(locale, code, minor) {
  return (value) => {
    const num = minor ? toNumber(value) / 100 : toNumber(value);
    return `${code ?? ''} ${num.toLocaleString(locale)}`.trim();
  };
}

// Returns a reusable formatter; charts call it per tick.
export function moneyFormatter(
  locale,
  { currency = null, compact = false, minor = false, fractionDigits } = {},
) {
  const code = currency ? String(currency).toUpperCase() : null;
  if (!code) return plain(locale, null, minor);

  let full;
  let short = null;
  let minorDigits = 2;
  try {
    full = cachedFormatter(
      locale,
      code,
      fractionDigits === undefined
        ? {}
        : { maximumFractionDigits: fractionDigits },
    );
    minorDigits =
      cachedFormatter(locale, code, {}).resolvedOptions()
        .maximumFractionDigits ?? 2;
    if (compact) {
      short = cachedFormatter(locale, code, {
        notation: 'compact',
        maximumFractionDigits: 1,
      });
    }
  } catch (error) {
    console.error(`moneyFormatter: currency "${code}" rejected`, error);
    return plain(locale, code, minor);
  }

  return (value) => {
    let num = toNumber(value);
    if (minor) num = num / 10 ** minorDigits;
    const formatter = short && Math.abs(num) >= COMPACT_FROM ? short : full;
    return formatter.format(num);
  };
}

// Fraction digits of a currency, for converting between major and minor units.
export function minorUnitDigits(currency, locale = 'en') {
  try {
    return (
      cachedFormatter(
        locale,
        String(currency).toUpperCase(),
        {},
      ).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export function formatMoney(value, locale, options) {
  if (value === null || value === undefined || value === '') return '';
  if (Number.isNaN(Number(value))) return '';
  return moneyFormatter(locale, options)(value);
}
