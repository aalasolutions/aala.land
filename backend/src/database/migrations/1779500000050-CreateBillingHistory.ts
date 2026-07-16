import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBillingHistory1779500000050 implements MigrationInterface {
    name = 'CreateBillingHistory1779500000050';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "billing_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "stripe_invoice_id" varchar(255) NOT NULL,
                "type" varchar(32) NOT NULL,
                "amount" integer NOT NULL,
                "currency" varchar(3) NOT NULL,
                "hosted_invoice_url" text,
                "invoice_pdf_url" text,
                "period_start" timestamptz,
                "period_end" timestamptz,
                "attempt_count" integer,
                "occurred_at" timestamptz NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_billing_history" PRIMARY KEY ("id")
            )
        `);
        // Idempotency key: one row per (invoice, outcome). Lets the webhook upsert
        // instead of duplicating on invoice.paid + invoice.payment_succeeded double-fire.
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_billing_history_invoice_type" ON "billing_history" ("stripe_invoice_id", "type")`,
        );
        // Composite (company_id, occurred_at DESC) serves the scoped list query:
        // WHERE company_id = $1 ORDER BY occurred_at DESC.
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_billing_history_company_occurred" ON "billing_history" ("company_id", "occurred_at" DESC)`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_billing_history_occurred" ON "billing_history" ("occurred_at" DESC)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_billing_history_occurred"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_billing_history_company_occurred"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_billing_history_invoice_type"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "billing_history"`);
    }
}
