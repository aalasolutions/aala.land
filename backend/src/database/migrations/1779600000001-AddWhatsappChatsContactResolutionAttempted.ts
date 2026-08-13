import { MigrationInterface, QueryRunner } from 'typeorm';

// whatsapp_chats.contact_id resolution should run at most once per chat. Without
// a marker, contact_id IS NULL stays true forever for a number nobody saved, so
// the resolution UPDATE (a correlated subquery over contacts) re-runs on every
// inbound message from that chat. This flag records that an attempt was made.
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
