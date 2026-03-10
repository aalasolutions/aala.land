import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVendorsTable1773138379927 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasTable = await queryRunner.query(
            `SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors'`,
        );
        if (hasTable.length) {
            return;
        }

        await queryRunner.query(`
            CREATE TYPE "vendors_specialty_enum" AS ENUM (
                'PLUMBING', 'ELECTRICAL', 'HVAC', 'STRUCTURAL',
                'CLEANING', 'PEST_CONTROL', 'APPLIANCE', 'PAINTING', 'GENERAL'
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "vendors" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "name" varchar(255) NOT NULL,
                "email" varchar(255),
                "phone" varchar(50),
                "specialty" "vendors_specialty_enum" NOT NULL DEFAULT 'GENERAL',
                "company_name" varchar(255),
                "address" text,
                "rating" decimal(3,2),
                "hourly_rate" decimal(10,2),
                "currency" varchar(3) NOT NULL DEFAULT 'AED',
                "is_active" boolean NOT NULL DEFAULT true,
                "notes" text,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_vendors" PRIMARY KEY ("id"),
                CONSTRAINT "FK_vendors_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_vendors_company_id" ON "vendors" ("company_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vendors_company_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "vendors"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "vendors_specialty_enum"`);
    }
}
