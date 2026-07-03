import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappAiWeeklyLimit1779200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE whatsapp_settings
        ADD COLUMN IF NOT EXISTS ai_weekly_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ai_weekly_window_start TIMESTAMPTZ NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE whatsapp_settings
        DROP COLUMN IF EXISTS ai_weekly_count,
        DROP COLUMN IF EXISTS ai_weekly_window_start
    `);
  }
}
