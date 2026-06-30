import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStripeFieldsToCompanies1774000000032 implements MigrationInterface {
    name = 'AddStripeFieldsToCompanies1774000000032';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "stripe_customer_id" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "stripe_subscription_status" varchar(50)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "companies"
            DROP COLUMN "stripe_subscription_status",
            DROP COLUMN "stripe_subscription_id",
            DROP COLUMN "stripe_customer_id"
        `);
    }
}
