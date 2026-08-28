// Company-global entity types, never region-scoped. Billing is global and
// admin-only.
const GLOBAL_ENTITY_TYPES = new Set(['billing']);

export function isGlobalEntityType(entityType: string): boolean {
  return GLOBAL_ENTITY_TYPES.has(entityType.toLowerCase());
}
