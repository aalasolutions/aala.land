import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappHistorySync1779700000016 implements MigrationInterface {
  name = 'AddWhatsappHistorySync1779700000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" ADD COLUMN IF NOT EXISTS "history_sync_status" varchar(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" ADD COLUMN IF NOT EXISTS "history_sync_progress" smallint`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" ADD COLUMN IF NOT EXISTS "history_sync_requested_at" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" DROP COLUMN IF EXISTS "history_sync_requested_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" DROP COLUMN IF EXISTS "history_sync_progress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" DROP COLUMN IF EXISTS "history_sync_status"`,
    );
  }
}
