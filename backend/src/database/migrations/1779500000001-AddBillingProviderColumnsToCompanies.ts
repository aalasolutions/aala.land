import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingProviderColumnsToCompanies1779500000001 implements MigrationInterface {
    name = 'AddBillingProviderColumnsToCompanies1779500000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "billing_provider" varchar(32) NOT NULL DEFAULT 'stripe'`);
        await queryRunner.query(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "billing_customer_id" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "billing_subscription_id" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "billing_status" varchar(50)`);
        await queryRunner.query(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "billing_meta" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "companies"
              DROP COLUMN IF EXISTS "billing_meta",
              DROP COLUMN IF EXISTS "billing_status",
              DROP COLUMN IF EXISTS "billing_subscription_id",
              DROP COLUMN IF EXISTS "billing_customer_id",
              DROP COLUMN IF EXISTS "billing_provider"
        `);
    }
}
