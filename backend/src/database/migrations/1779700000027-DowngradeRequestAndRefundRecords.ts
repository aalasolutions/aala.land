import { MigrationInterface, QueryRunner } from 'typeorm';

export class DowngradeRequestAndRefundRecords1779700000027 implements MigrationInterface {
  name = 'DowngradeRequestAndRefundRecords1779700000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "downgrade_requested_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "downgrade_requested_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "downgrade_subscription_id" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "downgrade_attempts" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "refund_terms_accepted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "refund_terms_accepted_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "refund_terms_version" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" ADD COLUMN "cause" character varying(16) NOT NULL DEFAULT 'make_it_right'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" ADD COLUMN "breakdown" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" ADD COLUMN "attempts" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" ADD COLUMN "last_error" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" ADD COLUMN "provider_invoice_id" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" ALTER COLUMN "created_by" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" ALTER COLUMN "created_by_email" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_history" ADD COLUMN "refund_status" character varying(16)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_history" DROP COLUMN IF EXISTS "refund_status"`,
    );
    // System rows keep their money record under the nil actor.
    await queryRunner.query(
      `UPDATE "payment_remedies" SET "created_by" = '00000000-0000-0000-0000-000000000000' WHERE "created_by" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "payment_remedies" SET "created_by_email" = 'system' WHERE "created_by_email" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" ALTER COLUMN "created_by_email" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" ALTER COLUMN "created_by" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" DROP COLUMN IF EXISTS "provider_invoice_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" DROP COLUMN IF EXISTS "last_error"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" DROP COLUMN IF EXISTS "attempts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" DROP COLUMN IF EXISTS "breakdown"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_remedies" DROP COLUMN IF EXISTS "cause"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "refund_terms_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "refund_terms_accepted_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "refund_terms_accepted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "downgrade_attempts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "downgrade_subscription_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "downgrade_requested_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "downgrade_requested_at"`,
    );
  }
}
