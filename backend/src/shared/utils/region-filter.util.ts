/**
 * Utility for region-based filtering via FK chain
 * Used by services that filter by regionCode through the Unit > Building > PropertyArea chain
 */

export const REGION_FILTER_SUBQUERY = `
  SELECT u.id FROM units u
  INNER JOIN buildings b ON u.building_id = b.id
  INNER JOIN property_areas pa ON b.area_id = pa.id
  WHERE pa.region_code = :regionCode
`;

/**
 * Appends region filter to a QueryBuilder if regionCode is provided
 * @param qb - QueryBuilder instance
 * @param entityIdColumn - The column name holding unit reference (e.g., 'unitId', 'l.unitId')
 * @param regionCode - The region code to filter by
 */
export function appendRegionFilter(
  qb: SelectQueryBuilder<any>,
  entityIdColumn: string,
  regionCode: string,
): void {
  qb.andWhere(
    `${entityIdColumn} IS NULL OR ${entityIdColumn} IN (${REGION_FILTER_SUBQUERY})`,
    { regionCode },
  );
}
