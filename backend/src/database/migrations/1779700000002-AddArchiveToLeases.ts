import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArchiveToLeases1779700000002 implements MigrationInterface {
  name = 'AddArchiveToLeases1779700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leases" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_leases_company_active_rows" ON "leases" ("company_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_leases_company_active_rows"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leases" DROP COLUMN IF EXISTS "deleted_at"`,
    );
  }
}
