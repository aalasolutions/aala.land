import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnitSubType1779700000029 implements MigrationInterface {
  name = 'AddUnitSubType1779700000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."units_sub_type_enum" AS ENUM('APARTMENT', 'VILLA', 'TOWNHOUSE', 'PENTHOUSE', 'OFFICE_SPACE', 'RETAIL_STORE', 'WAREHOUSE', 'LAND_PLOT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ADD COLUMN "sub_type" "public"."units_sub_type_enum"`,
    );
    // Rows created before the kind existed become apartments.
    await queryRunner.query(
      `UPDATE "units" SET "sub_type" = 'APARTMENT' WHERE "sub_type" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "sub_type" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "units" DROP COLUMN IF EXISTS "sub_type"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."units_sub_type_enum"`,
    );
  }
}
