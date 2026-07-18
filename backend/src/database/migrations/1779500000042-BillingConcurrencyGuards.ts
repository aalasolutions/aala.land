import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Concurrency backstops for the billing/seat core (race audit 2026-07-07).
 *
 * 1. companies.billing_last_event_at — recency marker for the webhook (P1c).
 *    Stores the Stripe event.created timestamp of the last seat/subscription
 *    sync applied to this company. An out-of-order or retried Stripe event
 *    (5->6 arriving after 6->7) must not overwrite purchasedSeats with a stale
 *    value; the webhook compares this marker and only applies a newer event.
 *
 * 2. UQ_companies_billing_customer_id — partial UNIQUE on billing_customer_id
 *    (P5). ensureCompanycustomer re-reads under an advisory lock before
 *    creating a Stripe customer, but this index is the database backstop that
 *    makes a duplicate customer id physically impossible if two writers still
 *    race. Partial (WHERE NOT NULL) so the many pre-checkout NULLs are exempt.
 */
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
