import { MigrationInterface, QueryRunner } from 'typeorm';
import { regionTimezoneSql } from '../../shared/utils/region-time.util';

export class TransactionMoneyDate1779700000012 implements MigrationInterface {
  name = 'TransactionMoneyDate1779700000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // paid_at already held the day the money arrived; created_at is only the fallback.
    // Checked rather than assumed, so a re-run after the column is dropped still works.
    const zone = regionTimezoneSql('t.region_code');
    const paidAt: unknown[] = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'paid_at'`,
    );
    const arrived = paidAt.length
      ? `COALESCE((t.paid_at AT TIME ZONE ${zone})::date, (t.created_at AT TIME ZONE ${zone})::date)`
      : `(t.created_at AT TIME ZONE ${zone})::date`;
    await queryRunner.query(
      `UPDATE "transactions" AS t SET "transaction_date" = ${arrived} WHERE t.transaction_date IS NULL AND t.status = 'COMPLETED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "paid_at"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_TRANSACTIONS_COMPANY_TRANSACTION_DATE" ON "transactions" ("company_id", "transaction_date")`,
    );
    // A btree on (company_id, transaction_date) serves every lookup (company_id) served.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_TRANSACTIONS_COMPANY_ID"`,
    );
    // The list pages on created_at DESC, which the money-date index cannot serve.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_TRANSACTIONS_COMPANY_CREATED_AT" ON "transactions" ("company_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_TRANSACTIONS_COMPANY_ID" ON "transactions" ("company_id")`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_TRANSACTIONS_COMPANY_CREATED_AT"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_TRANSACTIONS_COMPANY_TRANSACTION_DATE"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "paid_at" timestamptz`,
    );
  }
}
