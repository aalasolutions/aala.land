// Filters by regionCode via the Unit > Asset > Locality > City FK chain.

import { Raw, SelectQueryBuilder } from 'typeorm';

export const REGION_FILTER_SUBQUERY = `
  SELECT u.id FROM units u
  INNER JOIN assets ast ON u.asset_id = ast.id
  INNER JOIN localities loc ON ast.locality_id = loc.id
  INNER JOIN cities c ON loc.city_id = c.id
  WHERE c.region_code = :regionCode
`;

export const REGION_FILTER_SUBQUERY_MULTI = `
  SELECT u.id FROM units u
  INNER JOIN assets ast ON u.asset_id = ast.id
  INNER JOIN localities loc ON ast.locality_id = loc.id
  INNER JOIN cities c ON loc.city_id = c.id
  WHERE c.region_code IN (:...regionCodes)
`;

// For by-id reads using find options instead of a QueryBuilder; NULL unit doesn't match
export function unitInRegionsWhere(regionCodes: string[]) {
  return Raw((alias) => `${alias} IN (${REGION_FILTER_SUBQUERY_MULTI})`, {
    regionCodes,
  });
}

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
