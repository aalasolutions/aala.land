import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingCurrencyToCompanies1779500000049
    implements MigrationInterface
{
    name = 'AddBillingCurrencyToCompanies1779500000049';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Webhook-pinned subscription currency (lowercase ISO). Nullable: null until subscribed.
        await queryRunner.query(
            `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "billing_currency" varchar(3)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "companies" DROP COLUMN IF EXISTS "billing_currency"`,
        );
    }
}
