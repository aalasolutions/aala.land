import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegionCodeToCommissions1774000000010 implements MigrationInterface {
    name = 'AddRegionCodeToCommissions1774000000010';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add missing region_code column to commissions table
        await queryRunner.query(`ALTER TABLE "commissions" ADD COLUMN "region_code" varchar(50) NOT NULL DEFAULT 'dubai'`);

        // Create index for better query performance
        await queryRunner.query(`CREATE INDEX "IDX_COMMISSIONS_REGION_CODE" ON "commissions"("region_code")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the index and column
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_COMMISSIONS_REGION_CODE"`);
        await queryRunner.query(`ALTER TABLE "commissions" DROP COLUMN IF EXISTS "region_code"`);
    }
}
