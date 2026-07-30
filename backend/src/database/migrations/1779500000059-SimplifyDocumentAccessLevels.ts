import { MigrationInterface, QueryRunner } from 'typeorm';

// ADMIN replaces OWNER_ONLY + ADMIN_ONLY; TEAM replaces COMPANY + PUBLIC (owner-ruled rename).
export class SimplifyDocumentAccessLevels1779500000059
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "property_documents_access_level_enum_new" AS ENUM ('ADMIN', 'TEAM')`,
    );

    await queryRunner.query(
      `ALTER TABLE "property_documents" ADD "access_level_new" "property_documents_access_level_enum_new"`,
    );

    await queryRunner.query(`
      UPDATE "property_documents"
      SET "access_level_new" = (CASE "access_level"::text
        WHEN 'OWNER_ONLY' THEN 'ADMIN'
        WHEN 'ADMIN_ONLY' THEN 'ADMIN'
        WHEN 'COMPANY' THEN 'TEAM'
        WHEN 'PUBLIC' THEN 'TEAM'
      END)::"property_documents_access_level_enum_new"
    `);

    await queryRunner.query(
      `ALTER TABLE "property_documents" ALTER COLUMN "access_level_new" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_documents" ALTER COLUMN "access_level_new" SET DEFAULT 'TEAM'`,
    );

    await queryRunner.query(
      `ALTER TABLE "property_documents" DROP COLUMN "access_level"`,
    );
    await queryRunner.query(
      `DROP TYPE "property_documents_access_level_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "property_documents_access_level_enum_new" RENAME TO "property_documents_access_level_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_documents" RENAME COLUMN "access_level_new" TO "access_level"`,
    );
  }

  // Lossy: picks ADMIN_ONLY/COMPANY as the down-value for ADMIN/TEAM.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "property_documents_access_level_enum_old" AS ENUM ('PUBLIC', 'COMPANY', 'OWNER_ONLY', 'ADMIN_ONLY')`,
    );

    await queryRunner.query(
      `ALTER TABLE "property_documents" ADD "access_level_old" "property_documents_access_level_enum_old"`,
    );

    await queryRunner.query(`
      UPDATE "property_documents"
      SET "access_level_old" = (CASE "access_level"::text
        WHEN 'ADMIN' THEN 'ADMIN_ONLY'
        WHEN 'TEAM' THEN 'COMPANY'
      END)::"property_documents_access_level_enum_old"
    `);

    await queryRunner.query(
      `ALTER TABLE "property_documents" ALTER COLUMN "access_level_old" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_documents" ALTER COLUMN "access_level_old" SET DEFAULT 'COMPANY'`,
    );

    await queryRunner.query(
      `ALTER TABLE "property_documents" DROP COLUMN "access_level"`,
    );
    await queryRunner.query(
      `DROP TYPE "property_documents_access_level_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "property_documents_access_level_enum_old" RENAME TO "property_documents_access_level_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_documents" RENAME COLUMN "access_level_old" TO "access_level"`,
    );
  }
}
