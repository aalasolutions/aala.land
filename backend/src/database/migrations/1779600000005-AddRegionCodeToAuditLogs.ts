import { MigrationInterface, QueryRunner } from 'typeorm';

// Nullable: billing is global and admin-only, so billing rows keep NULL.
// Historical rows are backfilled from each company default; a company with
// no default keeps NULL. The billing test lowercases to match
// isGlobalEntityType.
export class AddRegionCodeToAuditLogs1779600000005 implements MigrationInterface {
  name = 'AddRegionCodeToAuditLogs1779600000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN "region_code" varchar(50)`,
    );

    await queryRunner.query(
      `UPDATE "audit_logs" a SET "region_code" = co."default_region_code"
       FROM "companies" co
       WHERE a."company_id" = co."id"
         AND LOWER(a."entity_type") <> 'billing'
         AND co."default_region_code" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_AUDIT_LOGS_REGION_CODE" ON "audit_logs"("region_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_AUDIT_LOGS_REGION_CODE"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "region_code"`,
    );
  }
}
