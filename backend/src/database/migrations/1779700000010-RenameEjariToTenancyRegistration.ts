import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameEjariToTenancyRegistration1779700000010
  implements MigrationInterface
{
  name = 'RenameEjariToTenancyRegistration1779700000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const column: { count: string }[] = await queryRunner.query(
      `SELECT count(*)::text AS count FROM information_schema.columns
       WHERE table_name = 'leases' AND column_name = 'ejari_number'`,
    );
    if (Number(column[0].count) > 0) {
      await queryRunner.query(
        `ALTER TABLE "leases" RENAME COLUMN "ejari_number" TO "tenancy_registration_ref"`,
      );
    }

    const enumValue: { count: string }[] = await queryRunner.query(
      `SELECT count(*)::text AS count FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'property_documents_category_enum' AND e.enumlabel = 'EJARI'`,
    );
    if (Number(enumValue[0].count) > 0) {
      await queryRunner.query(
        `ALTER TYPE "property_documents_category_enum" RENAME VALUE 'EJARI' TO 'TENANCY_REGISTRATION'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const enumValue: { count: string }[] = await queryRunner.query(
      `SELECT count(*)::text AS count FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'property_documents_category_enum' AND e.enumlabel = 'TENANCY_REGISTRATION'`,
    );
    if (Number(enumValue[0].count) > 0) {
      await queryRunner.query(
        `ALTER TYPE "property_documents_category_enum" RENAME VALUE 'TENANCY_REGISTRATION' TO 'EJARI'`,
      );
    }

    const column: { count: string }[] = await queryRunner.query(
      `SELECT count(*)::text AS count FROM information_schema.columns
       WHERE table_name = 'leases' AND column_name = 'tenancy_registration_ref'`,
    );
    if (Number(column[0].count) > 0) {
      await queryRunner.query(
        `ALTER TABLE "leases" RENAME COLUMN "tenancy_registration_ref" TO "ejari_number"`,
      );
    }
  }
}
