import { MigrationInterface, QueryRunner } from 'typeorm';

// Guards against stale/out-of-order Stripe webhooks and duplicate customer ids
export class BillingConcurrencyGuards1779500000042 implements MigrationInterface {
  name = 'BillingConcurrencyGuards1779500000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "billing_last_event_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_companies_billing_customer_id" ` +
        `ON "companies" ("billing_customer_id") WHERE "billing_customer_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_companies_billing_customer_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "billing_last_event_at"`,
    );
  }
}
