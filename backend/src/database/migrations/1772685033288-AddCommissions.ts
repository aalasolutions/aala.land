import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCommissions1772685033288 implements MigrationInterface {
    name = 'AddCommissions1772685033288'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."commissions_type_enum" AS ENUM('SALE', 'RENTAL', 'REFERRAL')`);
        await queryRunner.query(`CREATE TYPE "public"."commissions_status_enum" AS ENUM('PENDING', 'APPROVED', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "commissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "company_id" uuid NOT NULL, "agent_id" uuid NOT NULL, "lead_id" uuid, "transaction_id" uuid, "type" "public"."commissions_type_enum" NOT NULL DEFAULT 'SALE', "status" "public"."commissions_status_enum" NOT NULL DEFAULT 'PENDING', "gross_amount" numeric(12,2) NOT NULL, "commission_rate" numeric(5,2) NOT NULL, "commission_amount" numeric(12,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'AED', "paid_at" TIMESTAMP, "notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2701379966e2e670bb5ff0ae78e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "commissions" ADD CONSTRAINT "FK_72c5cb90cae74cf7ea1af139684" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "commissions" DROP CONSTRAINT "FK_72c5cb90cae74cf7ea1af139684"`);
        await queryRunner.query(`DROP TABLE "commissions"`);
        await queryRunner.query(`DROP TYPE "public"."commissions_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."commissions_type_enum"`);
    }

}
