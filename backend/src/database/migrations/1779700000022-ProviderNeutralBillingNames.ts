import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderNeutralBillingNames1779700000022 implements MigrationInterface {
  name = 'ProviderNeutralBillingNames1779700000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stripe_events" RENAME TO "billing_events"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_events" RENAME CONSTRAINT "PK_stripe_events" TO "PK_billing_events"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_events" RENAME CONSTRAINT "UQ_stripe_events_provider_event_id" TO "UQ_billing_events_provider_event_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_history" RENAME COLUMN "stripe_invoice_id" TO "provider_invoice_id"`,
    );

    // The adapter in use writes its own name; null means no provider yet.
    await queryRunner.query(
      `ALTER TABLE "companies" ALTER COLUMN "billing_provider" DROP DEFAULT, ALTER COLUMN "billing_provider" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "companies" SET "billing_provider" = NULL WHERE "billing_customer_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_prices" ALTER COLUMN "provider" DROP DEFAULT, ALTER COLUMN "provider" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "billing_prices" SET "provider" = NULL WHERE "provider_price_id" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "billing_prices" SET "provider" = 'stripe' WHERE "provider" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_prices" ALTER COLUMN "provider" SET NOT NULL, ALTER COLUMN "provider" SET DEFAULT 'stripe'`,
    );
    await queryRunner.query(
      `UPDATE "companies" SET "billing_provider" = 'stripe' WHERE "billing_provider" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ALTER COLUMN "billing_provider" SET NOT NULL, ALTER COLUMN "billing_provider" SET DEFAULT 'stripe'`,
    );

    await queryRunner.query(
      `ALTER TABLE "billing_history" RENAME COLUMN "provider_invoice_id" TO "stripe_invoice_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_events" RENAME CONSTRAINT "UQ_billing_events_provider_event_id" TO "UQ_stripe_events_provider_event_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_events" RENAME CONSTRAINT "PK_billing_events" TO "PK_stripe_events"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_events" RENAME TO "stripe_events"`,
    );
  }
}
