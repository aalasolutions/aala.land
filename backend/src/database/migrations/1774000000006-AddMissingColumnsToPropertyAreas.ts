import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingColumnsToPropertyAreas1774000000006 implements MigrationInterface {
  name = 'AddMissingColumnsToPropertyAreas1774000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "property_areas" ADD COLUMN "location" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_areas" ADD COLUMN "region_code" varchar(50) NOT NULL DEFAULT 'dubai'`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_PROPERTY_AREAS_REGION_CODE" ON "property_areas"("region_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_PROPERTY_AREAS_REGION_CODE"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_areas" DROP COLUMN IF EXISTS "region_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_areas" DROP COLUMN IF EXISTS "location"`,
    );
  }
}
