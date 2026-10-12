import { MigrationInterface, QueryRunner } from 'typeorm';

// charged_* amounts are minor units in billing_currency.
export class BillingCreditsAndChargedAmounts1779700000026 implements MigrationInterface {
  name = 'BillingCreditsAndChargedAmounts1779700000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_history" ADD COLUMN "credit_applied" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_history" ADD COLUMN "credit_issued" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_history" ADD COLUMN "origin" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "charged_seat_net" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "charged_seat_gross" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "charged_base_net" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "charged_base_gross" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "charged_base_gross"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "charged_base_net"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "charged_seat_gross"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "charged_seat_net"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_history" DROP COLUMN IF EXISTS "origin"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_history" DROP COLUMN IF EXISTS "credit_issued"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_history" DROP COLUMN IF EXISTS "credit_applied"`,
    );
  }
}
