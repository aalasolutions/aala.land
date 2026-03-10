import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLeads1772684244474 implements MigrationInterface {
    name = 'AddLeads1772684244474'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."leads_status_enum" AS ENUM('new', 'contacted', 'viewing', 'negotiating', 'won', 'lost')`);
        await queryRunner.query(`CREATE TYPE "public"."leads_temperature_enum" AS ENUM('hot', 'warm', 'cold', 'dead')`);
        await queryRunner.query(`CREATE TYPE "public"."leads_source_enum" AS ENUM('website', 'whatsapp', 'referral', 'social_media', 'walk_in', 'other')`);
        await queryRunner.query(`CREATE TABLE "leads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "company_id" uuid NOT NULL, "first_name" character varying(100) NOT NULL, "last_name" character varying(100), "email" character varying(255), "phone" character varying(50), "whatsapp_number" character varying(50), "status" "public"."leads_status_enum" NOT NULL DEFAULT 'new', "temperature" "public"."leads_temperature_enum" NOT NULL DEFAULT 'warm', "source" "public"."leads_source_enum" NOT NULL DEFAULT 'other', "score" integer NOT NULL DEFAULT '0', "assigned_to" uuid, "property_interest" text, "notes" text, "budget_min" numeric(12,2), "budget_max" numeric(12,2), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cd102ed7a9a4ca7d4d8bfeba406" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."lead_activities_type_enum" AS ENUM('call', 'email', 'whatsapp', 'viewing', 'note', 'status_change', 'assignment')`);
        await queryRunner.query(`CREATE TABLE "lead_activities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "company_id" uuid NOT NULL, "lead_id" uuid NOT NULL, "type" "public"."lead_activities_type_enum" NOT NULL DEFAULT 'note', "description" text NOT NULL, "performed_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1aa1cc6988a817368568ca26bf1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "leads" ADD CONSTRAINT "FK_1f14eab87273052d6a45373601c" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lead_activities" ADD CONSTRAINT "FK_4447211324cf26370da5fc1eedd" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "lead_activities" ADD CONSTRAINT "FK_26316cb0e146683e9e8aee237d4" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lead_activities" DROP CONSTRAINT "FK_26316cb0e146683e9e8aee237d4"`);
        await queryRunner.query(`ALTER TABLE "lead_activities" DROP CONSTRAINT "FK_4447211324cf26370da5fc1eedd"`);
        await queryRunner.query(`ALTER TABLE "leads" DROP CONSTRAINT "FK_1f14eab87273052d6a45373601c"`);
        await queryRunner.query(`DROP TABLE "lead_activities"`);
        await queryRunner.query(`DROP TYPE "public"."lead_activities_type_enum"`);
        await queryRunner.query(`DROP TABLE "leads"`);
        await queryRunner.query(`DROP TYPE "public"."leads_source_enum"`);
        await queryRunner.query(`DROP TYPE "public"."leads_temperature_enum"`);
        await queryRunner.query(`DROP TYPE "public"."leads_status_enum"`);
    }

}
