import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContacts1773300100000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasTable = await queryRunner.query(
            `SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts'`,
        );
        if (hasTable.length) {
            return;
        }

        await queryRunner.query(`
            CREATE TYPE "contacts_type_enum" AS ENUM ('LEAD', 'TENANT', 'OWNER', 'VENDOR', 'OTHER')
        `);

        await queryRunner.query(`
            CREATE TABLE "contacts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "company_id" uuid NOT NULL,
                "first_name" varchar(100) NOT NULL,
                "last_name" varchar(100),
                "email" varchar(255),
                "phone" varchar(50),
                "whatsapp_number" varchar(50),
                "type" "contacts_type_enum" NOT NULL DEFAULT 'OTHER',
                "contact_company" varchar(200),
                "job_title" varchar(100),
                "address" text,
                "notes" text,
                "tags" jsonb NOT NULL DEFAULT '[]',
                "lead_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_contacts" PRIMARY KEY ("id"),
                CONSTRAINT "FK_contacts_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_contacts_lead" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_contacts_company_id" ON "contacts" ("company_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contacts_company_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "contacts"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "contacts_type_enum"`);
    }
}
