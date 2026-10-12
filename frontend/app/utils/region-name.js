// An unknown code falls back to itself.
export function regionNameFor(regions, code) {
  if (!code) return '';
  return regions.find((r) => r.code === code)?.name ?? code;
}

// Currency of a region by code; null when the code is unknown, so callers fall back to the active region.
export function regionCurrencyFor(regions, code) {
  if (!code) return null;
  return regions.find((r) => r.code === code)?.currency ?? null;
}
