import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCheques1772684930871 implements MigrationInterface {
    name = 'AddCheques1772684930871'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."cheques_status_enum" AS ENUM('PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'CANCELLED', 'REPLACED')`);
        await queryRunner.query(`CREATE TYPE "public"."cheques_type_enum" AS ENUM('RENT', 'SECURITY_DEPOSIT', 'MAINTENANCE', 'OTHER')`);
        await queryRunner.query(`CREATE TABLE "cheques" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "company_id" uuid NOT NULL, "lease_id" uuid, "cheque_number" character varying(100) NOT NULL, "bank_name" character varying(255) NOT NULL, "account_holder" character varying(255) NOT NULL, "amount" numeric(12,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'AED', "due_date" date NOT NULL, "deposit_date" date, "status" "public"."cheques_status_enum" NOT NULL DEFAULT 'PENDING', "type" "public"."cheques_type_enum" NOT NULL DEFAULT 'RENT', "ocr_image_url" character varying, "ocr_processed" boolean NOT NULL DEFAULT false, "ocr_data" jsonb, "notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b87771b4d5f52b7e5bf4498e912" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "cheques" ADD CONSTRAINT "FK_7f92aa7ac942eedef9792c2a3f1" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cheques" DROP CONSTRAINT "FK_7f92aa7ac942eedef9792c2a3f1"`);
        await queryRunner.query(`DROP TABLE "cheques"`);
        await queryRunner.query(`DROP TYPE "public"."cheques_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."cheques_status_enum"`);
    }

}
