import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeOwnerContactsAndAddUniqueIndexes1779400000000 implements MigrationInterface {
  name = 'NormalizeOwnerContactsAndAddUniqueIndexes1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "owners"
            SET
                "email" = NULLIF(LOWER(BTRIM("email")), ''),
                "phone" = NULLIF(BTRIM("phone"), '')
        `);

    await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "company_id", "email"
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "owners"
                WHERE "email" IS NOT NULL
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id, canonical_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            UPDATE "units" AS u
            SET "owner_id" = d.canonical_id
            FROM duplicates d
            WHERE u."owner_id" = d.duplicate_id
        `);

    await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "company_id", "email"
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "owners"
                WHERE "email" IS NOT NULL
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            DELETE FROM "owners" AS o
            USING duplicates d
            WHERE o."id" = d.duplicate_id
        `);

    await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "company_id", "phone"
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "owners"
                WHERE "phone" IS NOT NULL
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id, canonical_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            UPDATE "units" AS u
            SET "owner_id" = d.canonical_id
            FROM duplicates d
            WHERE u."owner_id" = d.duplicate_id
        `);

    await queryRunner.query(`
            WITH ranked AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (
                        PARTITION BY "company_id", "phone"
                        ORDER BY "created_at" ASC, "id" ASC
                    ) AS canonical_id
                FROM "owners"
                WHERE "phone" IS NOT NULL
            ),
            duplicates AS (
                SELECT "id" AS duplicate_id
                FROM ranked
                WHERE "id" <> canonical_id
            )
            DELETE FROM "owners" AS o
            USING duplicates d
            WHERE o."id" = d.duplicate_id
        `);

    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_owners_company_normalized_email_unique"
            ON "owners" (
                "company_id",
                (LOWER(BTRIM("email")))
            )
            WHERE "email" IS NOT NULL
        `);

    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_owners_company_normalized_phone_unique"
            ON "owners" (
                "company_id",
                (BTRIM("phone"))
            )
            WHERE "phone" IS NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_owners_company_normalized_phone_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_owners_company_normalized_email_unique"`,
    );
  }
}
