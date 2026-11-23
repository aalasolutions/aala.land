import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappMessagesFromMeIndex1779700000032 implements MigrationInterface {
  name = 'AddWhatsappMessagesFromMeIndex1779700000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wa_messages_agent_from_me" ON "whatsapp_messages" ("company_id", "user_id", "from_me", "timestamp")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_wa_messages_agent_from_me"`,
    );
  }
}
