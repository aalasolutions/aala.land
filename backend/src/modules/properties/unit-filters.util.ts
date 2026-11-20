import type { UnitListFilters } from './properties.service';

// The query-string shape the list and the export share; numbers arrive as strings.
export interface UnitFilterQuery {
  amenities?: string;
  propertyType?: string;
  status?: string;
  minPrice?: string;
  maxPrice?: string;
  minBeds?: string;
  maxBeds?: string;
  localityId?: string;
  regionCode?: string;
  ownerId?: string;
  archived?: UnitListFilters['archived'];
}

export function toUnitFilters(query: UnitFilterQuery): UnitListFilters {
  return {
    amenities: query.amenities
      ? query.amenities
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
      : undefined,
    propertyType: query.propertyType || undefined,
    status: query.status || undefined,
    minPrice: query.minPrice ? Number(query.minPrice) : undefined,
    maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
    minBeds: query.minBeds ? Number(query.minBeds) : undefined,
    maxBeds: query.maxBeds ? Number(query.maxBeds) : undefined,
    localityId: query.localityId || undefined,
    regionCode: query.regionCode || undefined,
    ownerId: query.ownerId || undefined,
    archived: query.archived,
  };
}
