// Entity types that are company-global by nature and never region-scoped.
// Billing is owner-ruled: global, admin-only, never filtered by region.
const GLOBAL_ENTITY_TYPES = new Set(['billing']);

export function isGlobalEntityType(entityType: string): boolean {
  return GLOBAL_ENTITY_TYPES.has(entityType.toLowerCase());
}
