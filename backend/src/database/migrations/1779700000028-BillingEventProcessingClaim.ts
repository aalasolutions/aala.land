import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillingEventProcessingClaim1779700000028 implements MigrationInterface {
  name = 'BillingEventProcessingClaim1779700000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_events" ADD COLUMN "processing_started_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_events" DROP COLUMN IF EXISTS "processing_started_at"`,
    );
  }
}
