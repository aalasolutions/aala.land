import { MigrationInterface, QueryRunner } from 'typeorm';

// Keeps the provider's last sync error so a failed registration is never silent
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
