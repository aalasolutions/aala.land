import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNormalizedLocationNameUniqueIndexes1774000000026 implements MigrationInterface {
    name = 'AddNormalizedLocationNameUniqueIndexes1774000000026';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_localities_name_city"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cities_name_region"`);

        await queryRunner.query(`
            UPDATE "cities"
            SET "name" = regexp_replace(BTRIM("name"), '\\s+', ' ', 'g')
        `);

        await queryRunner.query(`
            UPDATE "localities"
            SET "name" = regexp_replace(BTRIM("name"), '\\s+', ' ', 'g')
        `);

        await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "region_code", LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g'))
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "cities"
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id, canonical_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            UPDATE "localities" AS l
            SET "city_id" = d.canonical_id
            FROM duplicates d
            WHERE l."city_id" = d.duplicate_id
        `);

        await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "region_code", LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g'))
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "cities"
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            DELETE FROM "cities" AS c
            USING duplicates d
            WHERE c."id" = d.duplicate_id
        `);

        await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "city_id", LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g'))
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "localities"
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id, canonical_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            UPDATE "buildings" AS b
            SET "locality_id" = d.canonical_id
            FROM duplicates d
            WHERE b."locality_id" = d.duplicate_id
        `);

        await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "city_id", LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g'))
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "localities"
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            DELETE FROM "localities" AS l
            USING duplicates d
            WHERE l."id" = d.duplicate_id
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_cities_region_normalized_name_unique"
            ON "cities" (
                "region_code",
                (LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g')))
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_localities_city_normalized_name_unique"
            ON "localities" (
                "city_id",
                (LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g')))
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_localities_city_normalized_name_unique"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cities_region_normalized_name_unique"`);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_cities_name_region" ON "cities" ("name", "region_code")
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_localities_name_city" ON "localities" ("name", "city_id")
        `);
    }
}
