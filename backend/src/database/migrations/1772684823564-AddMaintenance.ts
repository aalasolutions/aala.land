import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMaintenance1772684823564 implements MigrationInterface {
    name = 'AddMaintenance1772684823564'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."work_orders_status_enum" AS ENUM('OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TYPE "public"."work_orders_priority_enum" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT')`);
        await queryRunner.query(`CREATE TYPE "public"."work_orders_category_enum" AS ENUM('PLUMBING', 'ELECTRICAL', 'HVAC', 'STRUCTURAL', 'CLEANING', 'PEST_CONTROL', 'APPLIANCE', 'OTHER')`);
        await queryRunner.query(`CREATE TABLE "work_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "company_id" uuid NOT NULL, "unit_id" uuid, "title" character varying(255) NOT NULL, "description" text NOT NULL, "status" "public"."work_orders_status_enum" NOT NULL DEFAULT 'OPEN', "priority" "public"."work_orders_priority_enum" NOT NULL DEFAULT 'MEDIUM', "category" "public"."work_orders_category_enum" NOT NULL DEFAULT 'OTHER', "assigned_to" uuid, "reported_by" character varying(255), "estimated_cost" numeric(12,2), "actual_cost" numeric(12,2), "currency" character varying(3) NOT NULL DEFAULT 'AED', "scheduled_date" TIMESTAMP, "completed_at" TIMESTAMP, "notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_29f6c1884082ee6f535aed93660" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "work_orders" ADD CONSTRAINT "FK_5709f8a5c8b777a53b406d550ff" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "work_orders" DROP CONSTRAINT "FK_5709f8a5c8b777a53b406d550ff"`);
        await queryRunner.query(`DROP TABLE "work_orders"`);
        await queryRunner.query(`DROP TYPE "public"."work_orders_category_enum"`);
        await queryRunner.query(`DROP TYPE "public"."work_orders_priority_enum"`);
        await queryRunner.query(`DROP TYPE "public"."work_orders_status_enum"`);
    }

}
