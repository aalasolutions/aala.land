import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBillingPricesTable1779500000002 implements MigrationInterface {
  name = 'CreateBillingPricesTable1779500000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "billing_prices" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "kind" varchar(32) NOT NULL,
                "currency" varchar(3) NOT NULL,
                "unit_amount" integer NOT NULL,
                "provider" varchar(32) NOT NULL DEFAULT 'stripe',
                "provider_price_id" varchar(255),
                "active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_billing_prices" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_billing_prices_active"
              ON "billing_prices" ("kind", "currency") WHERE "active" = true
        `);

    // Seed launch prices. Amounts are minor units (cents / fils / halalas, all 2-decimal).
    // USD is the locked anchor. AED and SAR are a clean 95 / 950 (AAMIR, 2026-06-30),
    // a round local point, not a raw FX conversion.
    await queryRunner.query(`
            INSERT INTO "billing_prices" ("kind", "currency", "unit_amount") VALUES
              ('SEAT', 'usd', 2500),
              ('SEAT', 'aed', 9500),
              ('SEAT', 'sar', 9500),
              ('ENTERPRISE_BASE', 'usd', 25000),
              ('ENTERPRISE_BASE', 'aed', 95000),
              ('ENTERPRISE_BASE', 'sar', 95000)
            ON CONFLICT DO NOTHING
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "billing_prices"`);
  }
}
