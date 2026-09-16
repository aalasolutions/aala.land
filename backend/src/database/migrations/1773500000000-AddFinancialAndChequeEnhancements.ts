import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFinancialAndChequeEnhancements1773500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasPaymentMethodType = await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'transactions_payment_method_enum'`,
    );
    if (!hasPaymentMethodType.length) {
      await queryRunner.query(
        `CREATE TYPE "transactions_payment_method_enum" AS ENUM ('CASH', 'CHEQUE', 'BANK_TRANSFER', 'CREDIT_CARD', 'ONLINE')`,
      );
    }

    const hasPaymentMethod = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'payment_method'`,
    );
    if (!hasPaymentMethod.length) {
      await queryRunner.query(
        `ALTER TABLE "transactions" ADD "payment_method" "transactions_payment_method_enum" DEFAULT 'CASH'`,
      );
    }

    const hasBounceCount = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'cheques' AND column_name = 'bounce_count'`,
    );
    if (!hasBounceCount.length) {
      await queryRunner.query(
        `ALTER TABLE "cheques" ADD "bounce_count" integer NOT NULL DEFAULT 0`,
      );
    }

    const hasBounceReason = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'cheques' AND column_name = 'bounce_reason'`,
    );
    if (!hasBounceReason.length) {
      await queryRunner.query(
        `ALTER TABLE "cheques" ADD "bounce_reason" varchar(500)`,
      );
    }

    const hasLastBounceDate = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'cheques' AND column_name = 'last_bounce_date'`,
    );
    if (!hasLastBounceDate.length) {
      await queryRunner.query(
        `ALTER TABLE "cheques" ADD "last_bounce_date" TIMESTAMP`,
      );
    }

    const hasBounced = await queryRunner.query(
      `SELECT 1 FROM pg_enum WHERE enumlabel = 'BOUNCED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cheques_status_enum')`,
    );
    if (!hasBounced.length) {
      await queryRunner.query(
        `ALTER TYPE "cheques_status_enum" ADD VALUE IF NOT EXISTS 'BOUNCED'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cheques" DROP COLUMN IF EXISTS "last_bounce_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cheques" DROP COLUMN IF EXISTS "bounce_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cheques" DROP COLUMN IF EXISTS "bounce_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "payment_method"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "transactions_payment_method_enum"`,
    );
  }
}
