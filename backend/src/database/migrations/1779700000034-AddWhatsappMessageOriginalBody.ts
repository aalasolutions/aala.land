import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappMessageOriginalBody1779700000034 implements MigrationInterface {
  name = 'AddWhatsappMessageOriginalBody1779700000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "original_body" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages" DROP COLUMN IF EXISTS "original_body"`,
    );
  }
}
