import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingColumnsToPropertyAreas1774000000006 implements MigrationInterface {
    name = 'AddMissingColumnsToPropertyAreas1774000000006';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add missing columns to property_areas table
        await queryRunner.query(`ALTER TABLE "property_areas" ADD COLUMN "location" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "property_areas" ADD COLUMN "region_code" varchar(50) NOT NULL DEFAULT 'dubai'`);

        // Create index for region_code for better query performance
        await queryRunner.query(`CREATE INDEX "IDX_PROPERTY_AREAS_REGION_CODE" ON "property_areas"("region_code")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the index and columns
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PROPERTY_AREAS_REGION_CODE"`);
        await queryRunner.query(`ALTER TABLE "property_areas" DROP COLUMN IF EXISTS "region_code"`);
        await queryRunner.query(`ALTER TABLE "property_areas" DROP COLUMN IF EXISTS "location"`);
    }
}
