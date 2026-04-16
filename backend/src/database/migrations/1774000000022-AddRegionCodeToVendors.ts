import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegionCodeToVendors1774000000022 implements MigrationInterface {
    name = 'AddRegionCodeToVendors1774000000022';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add missing region_code column to vendors table
        await queryRunner.query(`ALTER TABLE "vendors" ADD COLUMN "region_code" varchar(50) NOT NULL DEFAULT 'dubai'`);

        // Create index for better query performance
        await queryRunner.query(`CREATE INDEX "IDX_VENDORS_REGION_CODE" ON "vendors"("region_code")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the index and column
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_VENDORS_REGION_CODE"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN IF EXISTS "region_code"`);
    }
}
