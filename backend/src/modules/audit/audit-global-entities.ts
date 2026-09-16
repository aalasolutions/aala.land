// Company-global entity types are never region-scoped; billing is admin-only.
const GLOBAL_ENTITY_TYPES = new Set(['billing']);

export function isGlobalEntityType(entityType: string): boolean {
  return GLOBAL_ENTITY_TYPES.has(entityType.toLowerCase());
}
