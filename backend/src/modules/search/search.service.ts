import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SearchService {
    constructor(private readonly dataSource: DataSource) {}

    private queryWithOptionalRegion(sql: string, params: unknown[], regionCode?: string) {
        const finalSql = sql.replace(
            '/* REGION_FILTER */',
            regionCode ? 'AND c.region_code = $3' : '',
        );
        return this.dataSource.query(
            finalSql,
            regionCode ? [...params, regionCode] : params,
        );
    }

    async search(q: string, companyId: string, regionCode?: string) {
        const term = `%${q}%`;
        const [cities, localities, assets, agents] = await Promise.all([
            this.queryWithOptionalRegion(
                `SELECT DISTINCT c.id, c.name
                 FROM cities c
                 INNER JOIN localities l ON l.city_id = c.id
                 INNER JOIN buildings b ON b.locality_id = l.id
                 WHERE c.name ILIKE $1
                   /* REGION_FILTER */
                   AND (b.company_id = $2
                        OR EXISTS (SELECT 1 FROM units u WHERE u.building_id = b.id AND u.company_id = $2))
                 LIMIT 5`,
                [term, companyId],
                regionCode,
            ),
            this.queryWithOptionalRegion(
                `SELECT l.id, l.name, c.name AS "cityName"
                 FROM localities l
                 INNER JOIN cities c ON c.id = l.city_id
                 INNER JOIN buildings b ON b.locality_id = l.id
                 WHERE l.name ILIKE $1
                   /* REGION_FILTER */
                   AND (b.company_id = $2
                        OR EXISTS (SELECT 1 FROM units u WHERE u.building_id = b.id AND u.company_id = $2))
                 GROUP BY l.id, l.name, c.name
                 LIMIT 5`,
                [term, companyId],
                regionCode,
            ),
            this.queryWithOptionalRegion(
                `SELECT b.id, b.name, b.locality_id AS "localityId", l.name AS "localityName"
                 FROM buildings b
                 INNER JOIN localities l ON l.id = b.locality_id
                 INNER JOIN cities c ON c.id = l.city_id
                 WHERE b.name ILIKE $1
                   /* REGION_FILTER */
                   AND (b.company_id = $2
                        OR EXISTS (SELECT 1 FROM units u WHERE u.building_id = b.id AND u.company_id = $2))
                 LIMIT 5`,
                [term, companyId],
                regionCode,
            ),
            this.dataSource.query(
                `SELECT id, name, role
                 FROM users
                 WHERE name ILIKE $1
                   AND company_id = $2
                   AND is_active = true
                 LIMIT 5`,
                [term, companyId],
            ),
        ]);

        return {
            properties: [
                ...cities.map((c: any) => ({ type: 'city', id: c.id, name: c.name, subtitle: 'City' })),
                ...localities.map((l: any) => ({ type: 'locality', id: l.id, name: l.name, subtitle: l.cityName })),
                ...assets.map((a: any) => ({ type: 'asset', id: a.id, name: a.name, subtitle: a.localityName, localityId: a.localityId })),
            ],
            agents: agents.map((u: any) => ({ type: 'agent', id: u.id, name: u.name, subtitle: u.role })),
        };
    }
}
