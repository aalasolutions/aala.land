import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persist the provider's last sync error VERBATIM per price row so a failed
 * registration is never silent (System screen, design section 10; the prod
 * bootstrap sync once failed silently).
 */
export class AddBillingPriceSyncError1779500000053 implements MigrationInterface {
  name = 'AddBillingPriceSyncError1779500000053';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_prices" ADD COLUMN IF NOT EXISTS "last_sync_error" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_prices" ADD COLUMN IF NOT EXISTS "last_sync_error_at" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_prices" DROP COLUMN IF EXISTS "last_sync_error_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_prices" DROP COLUMN IF EXISTS "last_sync_error"`,
    );
  }
}
