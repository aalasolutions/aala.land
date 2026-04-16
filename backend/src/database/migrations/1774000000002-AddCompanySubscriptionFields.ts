import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanySubscriptionFields1774000000002 implements MigrationInterface {
    name = 'AddCompanySubscriptionFields1774000000002';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add subscription-related columns to companies table
        await queryRunner.query(`
            ALTER TABLE "companies"
            ADD COLUMN "subscription_tier" varchar(50) DEFAULT 'FREE',
            ADD COLUMN "max_users" integer DEFAULT 1,
            ADD COLUMN "max_countries" integer DEFAULT 1,
            ADD COLUMN "max_properties" integer DEFAULT 25,
            ADD COLUMN "subscription_expires_at" timestamptz,
            ADD COLUMN "active_regions" jsonb,
            ADD COLUMN "default_region_code" varchar(50)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove subscription-related columns from companies table
        await queryRunner.query(`
            ALTER TABLE "companies"
            DROP COLUMN "default_region_code",
            DROP COLUMN "active_regions",
            DROP COLUMN "subscription_expires_at",
            DROP COLUMN "max_properties",
            DROP COLUMN "max_countries",
            DROP COLUMN "max_users",
            DROP COLUMN "subscription_tier"
        `);
    }
}
