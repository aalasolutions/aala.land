import { MigrationInterface, QueryRunner } from 'typeorm';

// A person can cover more than one region, so this is a join table rather than
// a column. Backfilled from each company's active_regions so no existing user
// loses access on deploy; narrowing is then an explicit admin action.
export class AddUserRegions1779600000006 implements MigrationInterface {
  name = 'AddUserRegions1779600000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_regions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "region_code" varchar(50) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_regions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_regions_user_region" UNIQUE ("user_id", "region_code"),
        CONSTRAINT "FK_user_regions_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_USER_REGIONS_USER_ID" ON "user_regions"("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_USER_REGIONS_REGION_CODE" ON "user_regions"("region_code")`,
    );

    // Every company region the user's company operates in.
    await queryRunner.query(`
      INSERT INTO "user_regions" ("user_id", "region_code")
      SELECT u."id", r."region_code"
      FROM "users" u
      JOIN "companies" c ON u."company_id" = c."id"
      CROSS JOIN LATERAL jsonb_array_elements_text(c."active_regions") AS r("region_code")
      WHERE c."active_regions" IS NOT NULL
        AND jsonb_typeof(c."active_regions") = 'array'
      ON CONFLICT ("user_id", "region_code") DO NOTHING
    `);

    // Companies with no active_regions array still need their people placed.
    await queryRunner.query(`
      INSERT INTO "user_regions" ("user_id", "region_code")
      SELECT u."id", c."default_region_code"
      FROM "users" u
      JOIN "companies" c ON u."company_id" = c."id"
      WHERE c."default_region_code" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "user_regions" ur WHERE ur."user_id" = u."id")
      ON CONFLICT ("user_id", "region_code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_regions"`);
  }
}
