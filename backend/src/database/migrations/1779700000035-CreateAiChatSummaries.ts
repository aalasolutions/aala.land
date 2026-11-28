import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiChatSummaries1779700000035 implements MigrationInterface {
  name = 'CreateAiChatSummaries1779700000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_chat_summaries" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "channel" varchar(32) NOT NULL,
                "chat_id" varchar(255) NOT NULL,
                "summary" text,
                "summarized_through" TIMESTAMPTZ,
                "session_started_at" TIMESTAMPTZ NOT NULL,
                "previous_inbound_at" TIMESTAMPTZ NOT NULL,
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ai_chat_summaries" PRIMARY KEY ("id"),
                CONSTRAINT "FK_ai_chat_summaries_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_chat_summaries_company_user_channel_chat" ON "ai_chat_summaries" ("company_id", "user_id", "channel", "chat_id")`,
    );
    // No FK on user_id: the conversation outlives the seat.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_chat_summaries"`);
  }
}
