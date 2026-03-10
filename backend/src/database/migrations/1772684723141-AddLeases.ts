import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLeases1772684723141 implements MigrationInterface {
    name = 'AddLeases1772684723141'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."leases_type_enum" AS ENUM('RESIDENTIAL', 'COMMERCIAL')`);
        await queryRunner.query(`CREATE TYPE "public"."leases_status_enum" AS ENUM('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED')`);
        await queryRunner.query(`CREATE TABLE "leases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "company_id" uuid NOT NULL, "unit_id" uuid NOT NULL, "tenant_name" character varying(255) NOT NULL, "tenant_email" character varying(255), "tenant_phone" character varying(30), "tenant_national_id" character varying(50), "type" "public"."leases_type_enum" NOT NULL DEFAULT 'RESIDENTIAL', "status" "public"."leases_status_enum" NOT NULL DEFAULT 'DRAFT', "start_date" date NOT NULL, "end_date" date NOT NULL, "monthly_rent" numeric(12,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'AED', "security_deposit" numeric(12,2), "number_of_cheques" integer NOT NULL DEFAULT '1', "ejari_number" character varying(100), "notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2668e338ab2d27079170ea55ea2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "leases" ADD CONSTRAINT "FK_4ee8911a28f4a26ee919e8cf791" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "leases" DROP CONSTRAINT "FK_4ee8911a28f4a26ee919e8cf791"`);
        await queryRunner.query(`DROP TABLE "leases"`);
        await queryRunner.query(`DROP TYPE "public"."leases_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."leases_type_enum"`);
    }

}
