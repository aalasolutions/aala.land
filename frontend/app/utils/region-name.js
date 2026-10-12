// An unknown code falls back to itself.
export function regionNameFor(regions, code) {
  if (!code) return '';
  return regions.find((r) => r.code === code)?.name ?? code;
}
