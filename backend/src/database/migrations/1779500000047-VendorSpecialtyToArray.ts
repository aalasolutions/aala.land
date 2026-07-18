import { MigrationInterface, QueryRunner } from 'typeorm';

export class VendorSpecialtyToArray1779500000047 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasNew = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'specialties'`,
    );
    if (hasNew.length) {
      return;
    }

    // Add the jsonb array column, backfill each existing single specialty as a one-element array,
    // then drop the old enum column and its type.
    await queryRunner.query(
      `ALTER TABLE "vendors" ADD COLUMN "specialties" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `UPDATE "vendors" SET "specialties" = jsonb_build_array("specialty"::text)`,
    );
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "specialty"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "vendors_specialty_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasOld = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'specialty'`,
    );
    if (hasOld.length) {
      return;
    }

    await queryRunner.query(`
      CREATE TYPE "vendors_specialty_enum" AS ENUM (
        'PLUMBING', 'ELECTRICAL', 'HVAC', 'STRUCTURAL',
        'CLEANING', 'PEST_CONTROL', 'APPLIANCE', 'PAINTING', 'GENERAL'
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "vendors" ADD COLUMN "specialty" "vendors_specialty_enum" NOT NULL DEFAULT 'GENERAL'`,
    );
    // Restore the first specialty when it maps to a valid enum value, otherwise keep the GENERAL default.
    await queryRunner.query(`
      UPDATE "vendors"
      SET "specialty" = ("specialties"->>0)::"vendors_specialty_enum"
      WHERE jsonb_array_length("specialties") > 0
        AND ("specialties"->>0) IN (
          'PLUMBING', 'ELECTRICAL', 'HVAC', 'STRUCTURAL',
          'CLEANING', 'PEST_CONTROL', 'APPLIANCE', 'PAINTING', 'GENERAL'
        )
    `);
    await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "specialties"`);
  }
}
