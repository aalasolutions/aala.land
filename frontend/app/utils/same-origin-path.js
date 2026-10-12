// Returns the path of a URL on the given origin, or null for any other origin (open-redirect guard).
export function sameOriginPath(url, origin = window.location.origin) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url, origin);
  } catch {
    return null;
  }
  if (parsed.origin !== origin) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
