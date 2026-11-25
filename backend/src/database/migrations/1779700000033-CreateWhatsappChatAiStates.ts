import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWhatsappChatAiStates1779700000033 implements MigrationInterface {
  name = 'CreateWhatsappChatAiStates1779700000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "whatsapp_chat_ai_states" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "chat_id" varchar(255) NOT NULL,
                "escalated_at" TIMESTAMPTZ,
                "escalation_reason" varchar(32),
                "escalation_notified_at" TIMESTAMPTZ,
                "escalation_holding_sent_at" TIMESTAMPTZ,
                "opted_out_at" TIMESTAMPTZ,
                "opt_out_language" varchar(8),
                "opt_out_confirmed_at" TIMESTAMPTZ,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "PK_whatsapp_chat_ai_states" PRIMARY KEY ("id"),
                CONSTRAINT "FK_wa_chat_ai_states_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wa_chat_ai_states_company_user_chat" ON "whatsapp_chat_ai_states" ("company_id", "user_id", "chat_id")`,
    );
    // No FK on user_id, same reasoning as whatsapp_chats.

    await queryRunner.query(
      `ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'WHATSAPP_ESCALATION'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Enum values cannot be dropped; WHATSAPP_ESCALATION stays.
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_chat_ai_states"`);
  }
}
