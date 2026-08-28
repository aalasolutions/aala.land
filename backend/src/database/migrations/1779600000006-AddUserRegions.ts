import { MigrationInterface, QueryRunner } from 'typeorm';

// A jsonb array on the user, matching companies.active_regions. Backfilled
// from each company active_regions so no user loses access on deploy.
export class AddUserRegions1779600000006 implements MigrationInterface {
  name = 'AddUserRegions1779600000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "region_codes" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );

    // The company default sorts first so element 0 is the scoping fallback.
    await queryRunner.query(`
      UPDATE "users" u
      SET "region_codes" = COALESCE((
        SELECT jsonb_agg(r."region_code" ORDER BY
                 (r."region_code" IS DISTINCT FROM c."default_region_code"),
                 r."region_code")
        FROM jsonb_array_elements_text(c."active_regions") AS r("region_code")
      ), '[]'::jsonb)
      FROM "companies" c
      WHERE u."company_id" = c."id"
        AND c."active_regions" IS NOT NULL
        AND jsonb_typeof(c."active_regions") = 'array'
    `);

    // Companies with no active_regions array still need their people placed.
    await queryRunner.query(`
      UPDATE "users" u
      SET "region_codes" = to_jsonb(ARRAY[c."default_region_code"])
      FROM "companies" c
      WHERE u."company_id" = c."id"
        AND c."default_region_code" IS NOT NULL
        AND u."region_codes" = '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "region_codes"`,
    );
  }
}
