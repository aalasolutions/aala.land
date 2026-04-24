import { MigrationInterface, QueryRunner } from 'typeorm';

export class PointLeadPropertyToLocalities1774000000023 implements MigrationInterface {
    name = 'PointLeadPropertyToLocalities1774000000023';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "fk_leads_property"`);
        await queryRunner.query(`
            WITH locality_matches AS (
                SELECT
                    pa.id AS property_area_id,
                    pa.company_id AS company_id,
                    MIN(l.id) AS locality_id
                FROM "property_areas" pa
                INNER JOIN "localities" l
                    ON LOWER(TRIM(l.name)) = LOWER(TRIM(pa.name))
                    AND l.created_by_company_id = pa.company_id
                INNER JOIN "cities" c
                    ON c.id = l.city_id
                    AND c.region_code = pa.region_code
                GROUP BY pa.id, pa.company_id
                HAVING COUNT(*) = 1
            )
            UPDATE "leads" ld
            SET "property_id" = locality_matches.locality_id
            FROM locality_matches
            WHERE ld.property_id = locality_matches.property_area_id
              AND ld.company_id = locality_matches.company_id
        `);
        await queryRunner.query(`
            UPDATE "leads" ld
            SET "property_id" = NULL
            WHERE ld.property_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM "localities" l
                  WHERE l.id = ld.property_id
              )
        `);
        await queryRunner.query(`
            ALTER TABLE "leads"
            ADD CONSTRAINT "fk_leads_property"
            FOREIGN KEY ("property_id") REFERENCES "localities"("id") NOT VALID
        `);
        await queryRunner.query(`ALTER TABLE "leads" VALIDATE CONSTRAINT "fk_leads_property"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "fk_leads_property"`);
        await queryRunner.query(`
            WITH property_area_matches AS (
                SELECT
                    l.id AS locality_id,
                    l.created_by_company_id AS company_id,
                    MIN(pa.id) AS property_area_id
                FROM "localities" l
                INNER JOIN "cities" c
                    ON c.id = l.city_id
                INNER JOIN "property_areas" pa
                    ON LOWER(TRIM(pa.name)) = LOWER(TRIM(l.name))
                    AND pa.company_id = l.created_by_company_id
                    AND pa.region_code = c.region_code
                GROUP BY l.id, l.created_by_company_id
                HAVING COUNT(*) = 1
            )
            UPDATE "leads" ld
            SET "property_id" = property_area_matches.property_area_id
            FROM property_area_matches
            WHERE ld.property_id = property_area_matches.locality_id
              AND ld.company_id = property_area_matches.company_id
        `);
        await queryRunner.query(`
            UPDATE "leads" ld
            SET "property_id" = NULL
            WHERE ld.property_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM "property_areas" pa
                  WHERE pa.id = ld.property_id
              )
        `);
        await queryRunner.query(`
            ALTER TABLE "leads"
            ADD CONSTRAINT "fk_leads_property"
            FOREIGN KEY ("property_id") REFERENCES "property_areas"("id") NOT VALID
        `);
        await queryRunner.query(`ALTER TABLE "leads" VALIDATE CONSTRAINT "fk_leads_property"`);
    }
}
