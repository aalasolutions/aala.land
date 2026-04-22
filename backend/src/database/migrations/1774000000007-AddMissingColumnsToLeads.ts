import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingColumnsToLeads1774000000007 implements MigrationInterface {
    name = 'AddMissingColumnsToLeads1774000000007';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add missing columns to leads table
        await queryRunner.query(`ALTER TABLE "leads" ADD COLUMN "property_id" uuid`);
        await queryRunner.query(`ALTER TABLE "leads" ADD COLUMN "unit_id" uuid`);
        await queryRunner.query(`ALTER TABLE "leads" ADD COLUMN "region_code" varchar(50) NOT NULL DEFAULT 'dubai'`);

        // Add foreign key constraints
        await queryRunner.query(`ALTER TABLE "leads" ADD CONSTRAINT "fk_leads_property" FOREIGN KEY ("property_id") REFERENCES "property_areas"("id")`);
        await queryRunner.query(`ALTER TABLE "leads" ADD CONSTRAINT "fk_leads_unit" FOREIGN KEY ("unit_id") REFERENCES "units"("id")`);

        // Create indexes for better query performance
        await queryRunner.query(`CREATE INDEX "IDX_LEADS_PROPERTY_ID" ON "leads"("property_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_LEADS_UNIT_ID" ON "leads"("unit_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_LEADS_REGION_CODE" ON "leads"("region_code")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes and foreign keys
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_LEADS_REGION_CODE"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_LEADS_UNIT_ID"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_LEADS_PROPERTY_ID"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "fk_leads_unit"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "fk_leads_property"`);

        // Drop the columns
        await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "region_code"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "unit_id"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "property_id"`);
    }
}
