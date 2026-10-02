const digitsByCurrency = new Map();

/** Minor-unit digits for an ISO 4217 code (USD 2, JPY 0, BHD 3); 2 when the code is invalid. */
export function currencyFractionDigits(currency) {
  const code = String(currency ?? '').toUpperCase();
  if (!digitsByCurrency.has(code)) {
    let digits = 2;
    try {
      digits =
        new Intl.NumberFormat('en', {
          style: 'currency',
          currency: code,
        }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      // Invalid code: keep 2.
    }
    digitsByCurrency.set(code, digits);
  }
  return digitsByCurrency.get(code);
}

/** Major-unit input to minor units; null when it is not a number or has more decimals than the currency. */
export function toMinorUnits(major, currency) {
  if (major === '' || major === null || major === undefined) return null;
  const scaled = Number(major) * 10 ** currencyFractionDigits(currency);
  const minor = Math.round(scaled);
  if (!Number.isFinite(scaled) || Math.abs(scaled - minor) > 1e-6) return null;
  return minor;
}
