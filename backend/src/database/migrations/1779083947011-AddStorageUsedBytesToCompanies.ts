import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStorageUsedBytesToCompanies1779083947011 implements MigrationInterface {
  name = 'AddStorageUsedBytesToCompanies1779083947011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols: Array<{ column_name: string }> = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'companies'
        AND column_name IN ('storage_used_bytes', 'purchased_seats')
    `);
    const existing = cols.map((r) => r.column_name);

    if (!existing.includes('storage_used_bytes')) {
      await queryRunner.query(`
        ALTER TABLE "companies"
          ADD COLUMN "storage_used_bytes" bigint NOT NULL DEFAULT 0
      `);
    }

    if (!existing.includes('purchased_seats')) {
      await queryRunner.query(`
        ALTER TABLE "companies"
          ADD COLUMN "purchased_seats" integer NOT NULL DEFAULT 1
      `);
    }

    await queryRunner.query(`
      UPDATE "companies" c
      SET "storage_used_bytes" = (
        SELECT COALESCE(SUM(
          COALESCE(pm.file_size, 0) + COALESCE(pm.thumbnail_size, 0)
        ), 0)
        FROM "property_media" pm
        WHERE pm.company_id = c.id
      ) + (
        SELECT COALESCE(SUM(COALESCE(pd.file_size, 0)), 0)
        FROM "property_documents" pd
        WHERE pd.company_id = c.id
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP COLUMN IF EXISTS "storage_used_bytes",
        DROP COLUMN IF EXISTS "purchased_seats"
    `);
  }
}
