import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappChatReadMarker1779600000014 implements MigrationInterface {
  name = 'AddWhatsappChatReadMarker1779600000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_chats" ADD COLUMN "last_read_message_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_chats" ADD COLUMN "unread_count" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_chats" DROP COLUMN "unread_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_chats" DROP COLUMN "last_read_message_id"`,
    );
  }
}
