/**
 * Utility for region-based filtering via FK chain
 * Used by services that filter by regionCode through the Unit > Asset > Locality > City chain
 */

import { SelectQueryBuilder } from 'typeorm';

export const REGION_FILTER_SUBQUERY = `
  SELECT u.id FROM units u
  INNER JOIN buildings ast ON u.building_id = ast.id
  INNER JOIN localities loc ON ast.locality_id = loc.id
  INNER JOIN cities c ON loc.city_id = c.id
  WHERE c.region_code = :regionCode
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
