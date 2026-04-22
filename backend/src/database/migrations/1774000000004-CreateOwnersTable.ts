import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOwnersTable1774000000004 implements MigrationInterface {
    name = 'CreateOwnersTable1774000000004';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "owners" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name" varchar(255) NOT NULL,
                "email" varchar(255),
                "phone" varchar(50),
                "nationality_id" varchar(100),
                "address" text,
                "notes" text,
                "assigned_agent_id" uuid,
                "company_id" uuid NOT NULL,
                "created_at" timestamp DEFAULT now(),
                "updated_at" timestamp DEFAULT now(),
                CONSTRAINT "fk_owners_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id"),
                CONSTRAINT "fk_owners_agent" FOREIGN KEY ("assigned_agent_id") REFERENCES "users"("id")
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_OWNERS_COMPANY_ID" ON "owners"("company_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "owners"`);
    }
}
