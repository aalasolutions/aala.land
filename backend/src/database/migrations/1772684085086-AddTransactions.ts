import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTransactions1772684085086 implements MigrationInterface {
    name = 'AddTransactions1772684085086'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."transactions_type_enum" AS ENUM('rent', 'sale', 'deposit', 'maintenance', 'commission', 'other')`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_status_enum" AS ENUM('pending', 'completed', 'cancelled', 'failed')`);
        await queryRunner.query(`CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "company_id" uuid NOT NULL, "type" "public"."transactions_type_enum" NOT NULL DEFAULT 'rent', "status" "public"."transactions_status_enum" NOT NULL DEFAULT 'pending', "amount" numeric(12,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'AED', "description" text, "reference_number" character varying(100), "unit_id" uuid, "due_date" date, "paid_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD CONSTRAINT "FK_8733562c5e54c31dd1ba8f49915" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_8733562c5e54c31dd1ba8f49915"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
    }

}
