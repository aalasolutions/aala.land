import { MigrationInterface, QueryRunner } from 'typeorm';

// Reshapes the WhatsApp tables from the Baileys model (one paired device per company,
// JID identifiers) to the Meta Cloud API model (one connected number per agent, E.164
// identifiers, delivery statuses, edits and deletes). Done as ONE migration because
// there are no production WhatsApp rows to preserve; splitting it would migrate the
// same tables twice.
export class WhatsappCloudApiSchema1779600000002 implements MigrationInterface {
  name = 'WhatsappCloudApiSchema1779600000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."whatsapp_connections_status_enum" AS ENUM('pending', 'connected', 'disconnected', 'flagged')`,
    );

    await queryRunner.query(`
      CREATE TABLE "whatsapp_connections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "waba_id" character varying(64) NOT NULL,
        "phone_number_id" character varying(64) NOT NULL,
        "display_phone_number" character varying(32) NOT NULL,
        "status" "public"."whatsapp_connections_status_enum" NOT NULL DEFAULT 'pending',
        "access_token_ciphertext" text,
        "token_updated_at" TIMESTAMP WITH TIME ZONE,
        "connected_at" TIMESTAMP WITH TIME ZONE,
        "disconnected_at" TIMESTAMP WITH TIME ZONE,
        "disconnect_reason" character varying(64),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_whatsapp_connections" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_wa_connections_user" ON "whatsapp_connections" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_wa_connections_phone_number_id" ON "whatsapp_connections" ("phone_number_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wa_connections_company_status" ON "whatsapp_connections" ("company_id", "status")`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."whatsapp_messages_status_enum" AS ENUM('sent', 'delivered', 'read', 'failed', 'played')`,
    );
    await queryRunner.query(`
      ALTER TABLE "whatsapp_messages"
        ADD COLUMN "phone_number_id" character varying(64),
        ADD COLUMN "status" "public"."whatsapp_messages_status_enum",
        ADD COLUMN "status_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "error_code" character varying(32),
        ADD COLUMN "edited_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "whatsapp_chats"
        ADD COLUMN "last_inbound_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "phone_number_id" character varying(64)
    `);

    await queryRunner.query(
      `ALTER TABLE "whatsapp_ai_conversations" ADD COLUMN "phone_number_id" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_ai_conversations" DROP COLUMN "phone_number_id"`,
    );

    await queryRunner.query(`
      ALTER TABLE "whatsapp_chats"
        DROP COLUMN "phone_number_id",
        DROP COLUMN "last_inbound_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "whatsapp_messages"
        DROP COLUMN "deleted_at",
        DROP COLUMN "edited_at",
        DROP COLUMN "error_code",
        DROP COLUMN "status_at",
        DROP COLUMN "status",
        DROP COLUMN "phone_number_id"
    `);
    await queryRunner.query(
      `DROP TYPE "public"."whatsapp_messages_status_enum"`,
    );

    await queryRunner.query(`DROP INDEX "IDX_wa_connections_company_status"`);
    await queryRunner.query(`DROP INDEX "UQ_wa_connections_phone_number_id"`);
    await queryRunner.query(`DROP INDEX "UQ_wa_connections_user"`);
    await queryRunner.query(`DROP TABLE "whatsapp_connections"`);
    await queryRunner.query(
      `DROP TYPE "public"."whatsapp_connections_status_enum"`,
    );
  }
}
