import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RegionScope } from '../../shared/utils/resolve-region-code.util';
import { effectiveRegionCodes } from '../../shared/utils/region-visibility.util';

@Injectable()
export class SearchService {
  constructor(private readonly dataSource: DataSource) {}

  private queryWithOptionalRegion(
    sql: string,
    params: unknown[],
    regionCodes: string[] | null,
  ) {
    // No readable region means no rows.
    if (regionCodes?.length === 0) {
      return Promise.resolve([]);
    }

    const finalSql = sql.replace(
      '/* REGION_FILTER */',
      regionCodes ? `AND c.region_code = ANY($${params.length + 1})` : '',
    );
    return this.dataSource.query(
      finalSql,
      regionCodes ? [...params, regionCodes] : params,
    );
  }

  async search(
    q: string,
    companyId: string,
    regionCode?: string,
    caller?: RegionScope,
  ) {
    const query = q?.trim();
    if (!query || query.length < 2) {
      return { properties: [], agents: [] };
    }

    const regionCodes = effectiveRegionCodes(regionCode, caller);
    const term = `${query.toLowerCase()}%`;
    const [cities, localities, assets, agents] = await Promise.all([
      this.queryWithOptionalRegion(
        // LOWER(c.name) is aliased into the SELECT so it can be used in
        // ORDER BY under SELECT DISTINCT (Postgres requires DISTINCT
        // ORDER BY expressions to appear in the select list, else the
        // whole /v1/search request 500s). The extra column is ignored
        // by the result mapper below.
        `SELECT DISTINCT c.id, c.name, LOWER(c.name) AS name_lower
                 FROM cities c
                 INNER JOIN localities l ON l.city_id = c.id
                 INNER JOIN assets b ON b.locality_id = l.id
                  WHERE LOWER(c.name) LIKE $1
                    /* REGION_FILTER */
                    AND (b.company_id = $2
                         OR EXISTS (SELECT 1 FROM units u WHERE u.asset_id = b.id AND u.company_id = $2))
                    ORDER BY name_lower
                    LIMIT 5`,

        [term, companyId],
        regionCodes,
      ),
      this.queryWithOptionalRegion(
        `SELECT l.id, l.name, c.name AS "cityName"
                 FROM localities l
                 INNER JOIN cities c ON c.id = l.city_id
                 INNER JOIN assets b ON b.locality_id = l.id
                 WHERE LOWER(l.name) LIKE $1
                   /* REGION_FILTER */
                   AND (b.company_id = $2
                        OR EXISTS (SELECT 1 FROM units u WHERE u.asset_id = b.id AND u.company_id = $2))
                  GROUP BY l.id, l.name, c.name
                  ORDER BY LOWER(l.name)
                  LIMIT 5`,
        [term, companyId],
        regionCodes,
      ),
      this.queryWithOptionalRegion(
        `SELECT b.id, b.name, b.locality_id AS "localityId", l.name AS "localityName"
                 FROM assets b
                 INNER JOIN localities l ON l.id = b.locality_id
                 INNER JOIN cities c ON c.id = l.city_id
                  WHERE LOWER(b.name) LIKE $1
                    /* REGION_FILTER */
                    AND (b.company_id = $2
                         OR EXISTS (SELECT 1 FROM units u WHERE u.asset_id = b.id AND u.company_id = $2))
                  ORDER BY LOWER(b.name)
                  LIMIT 5`,
        [term, companyId],
        regionCodes,
      ),
      this.dataSource.query(
        `SELECT id, name, role
                 FROM users
                  WHERE LOWER(name) LIKE $1
                    AND company_id = $2
                    AND is_active = true
                    AND role != 'super_admin'
                  ORDER BY LOWER(name)
                  LIMIT 5`,
        [term, companyId],
      ),
    ]);

    return {
      properties: [
        ...cities.map((c: any) => ({
          type: 'city',
          id: c.id,
          name: c.name,
          subtitle: 'City',
        })),
        ...localities.map((l: any) => ({
          type: 'locality',
          id: l.id,
          name: l.name,
          subtitle: l.cityName,
        })),
        ...assets.map((a: any) => ({
          type: 'asset',
          id: a.id,
          name: a.name,
          subtitle: a.localityName,
          localityId: a.localityId,
        })),
      ],
      agents: agents.map((u: any) => ({
        type: 'agent',
        id: u.id,
        name: u.name,
        subtitle: u.role,
      })),
    };
  }
}
