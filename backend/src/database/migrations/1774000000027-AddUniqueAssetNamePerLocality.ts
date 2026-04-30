import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueAssetNamePerLocality1774000000027 implements MigrationInterface {
    name = 'AddUniqueAssetNamePerLocality1774000000027';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "buildings"
            SET "name" = regexp_replace(BTRIM("name"), '\\s+', ' ', 'g')
        `);

        await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "locality_id", LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g'))
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "buildings"
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id, canonical_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            UPDATE "units" AS u
            SET "building_id" = d.canonical_id
            FROM duplicates d
            WHERE u."building_id" = d.duplicate_id
        `);

        await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "locality_id", LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g'))
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "buildings"
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id, canonical_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            UPDATE "property_media" AS pm
            SET "building_id" = d.canonical_id
            FROM duplicates d
            WHERE pm."building_id" = d.duplicate_id
        `);

        await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "locality_id", LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g'))
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "buildings"
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id, canonical_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            UPDATE "property_documents" AS pd
            SET "building_id" = d.canonical_id
            FROM duplicates d
            WHERE pd."building_id" = d.duplicate_id
        `);

        await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "locality_id", LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g'))
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "buildings"
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            DELETE FROM "buildings" AS b
            USING duplicates d
            WHERE b."id" = d.duplicate_id
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_buildings_locality_normalized_name_unique"
            ON "buildings" (
                "locality_id",
                (LOWER(regexp_replace(BTRIM("name"), '\\s+', ' ', 'g')))
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_buildings_locality_normalized_name_unique"`);
    }
}
