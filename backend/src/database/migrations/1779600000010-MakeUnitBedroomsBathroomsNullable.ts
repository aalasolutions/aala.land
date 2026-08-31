import { MigrationInterface, QueryRunner } from 'typeorm';

// NULL means unknown, 0 means a genuine zero such as a studio.
// Existing 0s are left as they are.
export class MakeUnitBedroomsBathroomsNullable1779600000010 implements MigrationInterface {
  name = 'MakeUnitBedroomsBathroomsNullable1779600000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "bedrooms" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "bedrooms" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "bathrooms" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "bathrooms" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // NULLs must go before NOT NULL can be restored.
    await queryRunner.query(
      `UPDATE "units" SET "bedrooms" = 0 WHERE "bedrooms" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "units" SET "bathrooms" = 0 WHERE "bathrooms" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "bedrooms" SET DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "bedrooms" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "bathrooms" SET DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ALTER COLUMN "bathrooms" SET NOT NULL`,
    );
  }
}
