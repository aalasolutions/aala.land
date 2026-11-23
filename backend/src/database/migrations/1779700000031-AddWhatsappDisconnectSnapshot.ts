import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappDisconnectSnapshot1779700000031 implements MigrationInterface {
  name = 'AddWhatsappDisconnectSnapshot1779700000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" ADD COLUMN IF NOT EXISTS "disconnect_snapshot" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_connections" DROP COLUMN IF EXISTS "disconnect_snapshot"`,
    );
  }
}
