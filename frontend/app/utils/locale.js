const UI_LANGUAGE = 'en';

// Region country sets number formatting; no active region falls back to the browser locale.
export function localeForRegion(region) {
  const country = region?.country;
  if (country) return `${UI_LANGUAGE}-${String(country).toUpperCase()}`;
  return navigator.language || UI_LANGUAGE;
}
