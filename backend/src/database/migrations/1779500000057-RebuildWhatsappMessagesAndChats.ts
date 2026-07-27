import { MigrationInterface, QueryRunner } from 'typeorm';

// Replaces the unused Twilio-era whatsapp_messages. down() restores the schema, not the rows.
export class RebuildWhatsappMessagesAndChats1779500000057 implements MigrationInterface {
  name = 'RebuildWhatsappMessagesAndChats1779500000057';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [existing] = (await queryRunner.query(
      `SELECT to_regclass('public.whatsapp_messages') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    if (existing?.present) {
      const [rows] = (await queryRunner.query(
        `SELECT count(*)::int AS count FROM "whatsapp_messages"`,
      )) as Array<{ count: number }>;
      if (rows.count > 0) {
        throw new Error(
          `whatsapp_messages holds ${rows.count} row(s). This migration replaces the table and cannot preserve them; export the rows, then re-run.`,
        );
      }
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_messages"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "whatsapp_messages_direction_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "whatsapp_messages_status_enum"`,
    );

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "origin_user_id" uuid,
                "wa_message_id" varchar(255) NOT NULL,
                "chat_id" varchar(255) NOT NULL,
                "sender_id" varchar(255) NOT NULL DEFAULT '',
                "sender_name" varchar(255) NOT NULL DEFAULT '',
                "chat_name" varchar(255) NOT NULL DEFAULT '',
                "is_group" boolean NOT NULL DEFAULT false,
                "body" text NOT NULL DEFAULT '',
                "has_media" boolean NOT NULL DEFAULT false,
                "media_type" varchar(32) NOT NULL DEFAULT '',
                "media_urls" jsonb NOT NULL DEFAULT '[]',
                "mentioned_ids" jsonb NOT NULL DEFAULT '[]',
                "quoted_participant" varchar(255) NOT NULL DEFAULT '',
                "from_me" boolean NOT NULL DEFAULT false,
                "ai_generated" boolean NOT NULL DEFAULT false,
                "timestamp" bigint NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_whatsapp_messages" PRIMARY KEY ("id")
            )
        `);

    // user_id is part of the key: a WhatsApp message id is minted by the sender, so two
    // agents in one company can receive the same id. Without it, one copy is dropped.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wa_messages_company_user_wa_id" ON "whatsapp_messages" ("company_id", "user_id", "wa_message_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wa_messages_chat" ON "whatsapp_messages" ("company_id", "user_id", "chat_id", "timestamp")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wa_messages_agent" ON "whatsapp_messages" ("company_id", "user_id", "timestamp")`,
    );
    await queryRunner.query(`
            ALTER TABLE "whatsapp_messages"
            ADD CONSTRAINT "FK_wa_messages_company"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    // No FK on user_id: the conversation outlives the seat. Deleting an agent reassigns.

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "whatsapp_chats" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "chat_id" varchar(255) NOT NULL,
                "chat_name" varchar(255) NOT NULL DEFAULT '',
                "is_group" boolean NOT NULL DEFAULT false,
                "last_body" text NOT NULL DEFAULT '',
                "last_ts" bigint NOT NULL DEFAULT 0,
                "last_from_me" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_whatsapp_chats" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wa_chats_company_user_chat" ON "whatsapp_chats" ("company_id", "user_id", "chat_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wa_chats_recent" ON "whatsapp_chats" ("company_id", "user_id", "last_ts")`,
    );
    await queryRunner.query(`
            ALTER TABLE "whatsapp_chats"
            ADD CONSTRAINT "FK_wa_chats_company"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    // No FK on user_id, same reasoning as whatsapp_messages above.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_chats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_messages"`);

    await queryRunner.query(
      `CREATE TYPE "whatsapp_messages_direction_enum" AS ENUM('INBOUND', 'OUTBOUND')`,
    );
    await queryRunner.query(
      `CREATE TYPE "whatsapp_messages_status_enum" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED')`,
    );
    await queryRunner.query(`
            CREATE TABLE "whatsapp_messages" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "lead_id" uuid,
                "phone_number" varchar(30) NOT NULL,
                "message" text NOT NULL,
                "direction" "whatsapp_messages_direction_enum" NOT NULL DEFAULT 'OUTBOUND',
                "status" "whatsapp_messages_status_enum" NOT NULL DEFAULT 'QUEUED',
                "external_id" varchar,
                "media_url" varchar,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_807bc612c6b98de7645a99805ca" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "whatsapp_messages"
            ADD CONSTRAINT "FK_9a9b15c757260582626aabcaa56"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
  }
}
