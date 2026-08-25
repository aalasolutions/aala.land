import { MigrationInterface, QueryRunner } from 'typeorm';

// Nullable on purpose: billing is global and admin-only, so billing rows keep a
// NULL region forever and are never shown to a region-scoped user. Historical
// rows are backfilled to 'punjab' per owner ruling; that data is disposable.
export class AddRegionCodeToAuditLogs1779600000005
  implements MigrationInterface
{
  name = 'AddRegionCodeToAuditLogs1779600000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN "region_code" varchar(50)`,
    );

    await queryRunner.query(
      `UPDATE "audit_logs" SET "region_code" = 'punjab' WHERE "entity_type" <> 'billing'`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_AUDIT_LOGS_REGION_CODE" ON "audit_logs"("region_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_AUDIT_LOGS_REGION_CODE"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "region_code"`,
    );
  }
}
