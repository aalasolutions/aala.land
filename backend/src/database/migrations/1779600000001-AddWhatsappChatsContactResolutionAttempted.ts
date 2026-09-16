import { MigrationInterface, QueryRunner } from 'typeorm';

// Skips re-running the resolution UPDATE for a number that never resolves
export class AddWhatsappChatsContactResolutionAttempted1779600000001 implements MigrationInterface
{
  name = 'AddWhatsappChatsContactResolutionAttempted1779600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_chats" ADD COLUMN "contact_resolution_attempted" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_chats" DROP COLUMN "contact_resolution_attempted"`,
    );
  }
}
