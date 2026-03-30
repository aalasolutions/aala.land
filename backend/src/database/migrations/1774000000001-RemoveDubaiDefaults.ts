import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDubaiDefaults1774000000001 implements MigrationInterface {
    name = 'RemoveDubaiDefaults1774000000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Companies: drop defaults on active_regions and default_region_code
        await queryRunner.query(`ALTER TABLE "companies" ALTER COLUMN "active_regions" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "companies" ALTER COLUMN "default_region_code" DROP DEFAULT`);

        // Property areas: drop default on region_code
        await queryRunner.query(`ALTER TABLE "property_areas" ALTER COLUMN "region_code" DROP DEFAULT`);

        // Leads: drop default on region_code
        await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "region_code" DROP DEFAULT`);

        // Vendors: drop default on region_code
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "region_code" DROP DEFAULT`);

        // Commissions: drop default on region_code
        await queryRunner.query(`ALTER TABLE "commissions" ALTER COLUMN "region_code" DROP DEFAULT`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restore dubai defaults
        await queryRunner.query(`ALTER TABLE "commissions" ALTER COLUMN "region_code" SET DEFAULT 'dubai'`);
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "region_code" SET DEFAULT 'dubai'`);
        await queryRunner.query(`ALTER TABLE "leads" ALTER COLUMN "region_code" SET DEFAULT 'dubai'`);
        await queryRunner.query(`ALTER TABLE "property_areas" ALTER COLUMN "region_code" SET DEFAULT 'dubai'`);
        await queryRunner.query(`ALTER TABLE "companies" ALTER COLUMN "default_region_code" SET DEFAULT 'dubai'`);
        await queryRunner.query(`ALTER TABLE "companies" ALTER COLUMN "active_regions" SET DEFAULT '["dubai"]'`);
    }
}
