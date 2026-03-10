import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWhatsapp1772684535310 implements MigrationInterface {
    name = 'AddWhatsapp1772684535310'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."whatsapp_messages_direction_enum" AS ENUM('INBOUND', 'OUTBOUND')`);
        await queryRunner.query(`CREATE TYPE "public"."whatsapp_messages_status_enum" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "whatsapp_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "company_id" uuid NOT NULL, "lead_id" uuid, "phone_number" character varying(30) NOT NULL, "message" text NOT NULL, "direction" "public"."whatsapp_messages_direction_enum" NOT NULL DEFAULT 'OUTBOUND', "status" "public"."whatsapp_messages_status_enum" NOT NULL DEFAULT 'QUEUED', "external_id" character varying, "media_url" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_807bc612c6b98de7645a99805ca" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "FK_9a9b15c757260582626aabcaa56" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "whatsapp_messages" DROP CONSTRAINT "FK_9a9b15c757260582626aabcaa56"`);
        await queryRunner.query(`DROP TABLE "whatsapp_messages"`);
        await queryRunner.query(`DROP TYPE "public"."whatsapp_messages_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."whatsapp_messages_direction_enum"`);
    }

}
