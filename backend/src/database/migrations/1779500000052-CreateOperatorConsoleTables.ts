import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Operator console v2 (S2702 ratified design): custom deals, lock lifts,
 * manual payments, payment remedies.
 */
export class CreateOperatorConsoleTables1779500000052 implements MigrationInterface {
  name = 'CreateOperatorConsoleTables1779500000052';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "custom_deals" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "price_amount" bigint NOT NULL,
                "currency" varchar(3) NOT NULL,
                "basis" varchar(16) NOT NULL,
                "seat_cap" integer NOT NULL,
                "until_date" timestamptz,
                "why_note" text NOT NULL,
                "granted_by" uuid NOT NULL,
                "granted_by_email" varchar(255) NOT NULL,
                "updated_by" uuid,
                "updated_by_email" varchar(255),
                "ended_at" timestamptz,
                "ended_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_custom_deals" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_custom_deals_company" ON "custom_deals" ("company_id")`,
    );
    // One ACTIVE deal per company; ended deals stay as history rows.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_custom_deals_active_company" ON "custom_deals" ("company_id") WHERE "ended_at" IS NULL`,
    );

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "lock_lifts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "lift_until" timestamptz NOT NULL,
                "granted_by" uuid NOT NULL,
                "granted_by_email" varchar(255) NOT NULL,
                "ended_at" timestamptz,
                "ended_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_lock_lifts" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_lock_lifts_company" ON "lock_lifts" ("company_id")`,
    );

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "manual_payments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "amount" bigint NOT NULL,
                "currency" varchar(3) NOT NULL,
                "received_at" date NOT NULL,
                "covers_start" date NOT NULL,
                "covers_end" date NOT NULL,
                "notes" text,
                "receipt_key" varchar(512),
                "receipt_mime" varchar(64),
                "recorded_by" uuid NOT NULL,
                "recorded_by_email" varchar(255) NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_manual_payments" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_manual_payments_company" ON "manual_payments" ("company_id")`,
    );
    // Serves the per-company latest-coverage lookup in lock evaluation.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_manual_payments_company_covers" ON "manual_payments" ("company_id", "covers_end")`,
    );
    // Serves the upcoming-manual-payments rollup (covers_end within window).
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_manual_payments_covers_end" ON "manual_payments" ("covers_end")`,
    );

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "payment_remedies" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "kind" varchar(24) NOT NULL,
                "refund_scope" varchar(8),
                "amount" bigint NOT NULL,
                "currency" varchar(3) NOT NULL,
                "payment_source" varchar(8) NOT NULL,
                "billing_history_id" uuid,
                "manual_payment_id" uuid,
                "provider_ref" varchar(255),
                "status" varchar(16) NOT NULL DEFAULT 'initiated',
                "why_note" text NOT NULL,
                "created_by" uuid NOT NULL,
                "created_by_email" varchar(255) NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_payment_remedies" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payment_remedies_company" ON "payment_remedies" ("company_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_remedies"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_manual_payments_covers_end"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_manual_payments_company_covers"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "manual_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lock_lifts"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_custom_deals_active_company"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "custom_deals"`);
  }
}
