import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiCreditsAndConversations1779500000056 implements MigrationInterface {
  name = 'AddAiCreditsAndConversations1779500000056';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "whatsapp_ai_conversations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "chat_id" varchar(255) NOT NULL,
                "lead_id" uuid,
                "started_at" timestamptz NOT NULL,
                "expires_at" timestamptz NOT NULL,
                "messages_count" integer NOT NULL DEFAULT 1,
                "period_start" timestamptz NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_whatsapp_ai_conversations" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wa_ai_conversations_window" ON "whatsapp_ai_conversations" ("company_id", "user_id", "chat_id", "expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wa_ai_conversations_period" ON "whatsapp_ai_conversations" ("company_id", "period_start")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wa_ai_conversations_open" ON "whatsapp_ai_conversations" ("company_id", "expires_at")`,
    );
    // Console overview filters on started_at alone; every index above leads with company_id.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wa_ai_conversations_started_at" ON "whatsapp_ai_conversations" ("started_at")`,
    );
    await queryRunner.query(`
            ALTER TABLE "whatsapp_ai_conversations"
            ADD CONSTRAINT "FK_wa_ai_conversations_company"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "whatsapp_ai_conversations"
            ADD CONSTRAINT "FK_wa_ai_conversations_user"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "whatsapp_ai_conversations"
            ADD CONSTRAINT "FK_wa_ai_conversations_lead"
            FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION
        `);

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_credit_usage" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "period_start" timestamptz NOT NULL,
                "period_end" timestamptz NOT NULL,
                "credits_used" integer NOT NULL DEFAULT 0,
                "exhausted_notified_at" timestamptz,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ai_credit_usage" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_credit_usage_company_period" ON "ai_credit_usage" ("company_id", "period_start")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_credit_usage_period_window" ON "ai_credit_usage" ("period_start", "period_end")`,
    );
    await queryRunner.query(`
            ALTER TABLE "ai_credit_usage"
            ADD CONSTRAINT "FK_ai_credit_usage_company"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);

    await queryRunner.query(`
            ALTER TABLE "whatsapp_settings"
            DROP COLUMN IF EXISTS "ai_weekly_count",
            DROP COLUMN IF EXISTS "ai_weekly_window_start"
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "whatsapp_settings"
            ADD COLUMN IF NOT EXISTS "ai_weekly_count" INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "ai_weekly_window_start" TIMESTAMPTZ NULL
        `);
    await queryRunner.query(
      `ALTER TABLE "ai_credit_usage" DROP CONSTRAINT IF EXISTS "FK_ai_credit_usage_company"`,
    );
    await queryRunner.query(`
            ALTER TABLE "whatsapp_ai_conversations"
            DROP CONSTRAINT IF EXISTS "FK_wa_ai_conversations_company",
            DROP CONSTRAINT IF EXISTS "FK_wa_ai_conversations_user",
            DROP CONSTRAINT IF EXISTS "FK_wa_ai_conversations_lead"
        `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_ai_credit_usage_period_window"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_wa_ai_conversations_started_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_credit_usage"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_ai_conversations"`);
  }
}
