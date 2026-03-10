import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailTemplates1773300200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'email_templates'`,
    );
    if (hasTable.length) return;

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "email_template_category_enum" AS ENUM('FOLLOW_UP', 'WELCOME', 'LEASE_RENEWAL', 'PAYMENT_REMINDER', 'MAINTENANCE_UPDATE', 'MARKETING', 'CUSTOM');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE "email_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "name" varchar(200) NOT NULL,
        "subject" varchar(500) NOT NULL,
        "body" text NOT NULL,
        "category" "email_template_category_enum" NOT NULL DEFAULT 'CUSTOM',
        "variables" jsonb NOT NULL DEFAULT '[]',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_templates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_templates_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_EMAIL_TEMPLATES_COMPANY_ID" ON "email_templates" ("company_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_EMAIL_TEMPLATES_CATEGORY" ON "email_templates" ("category")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_templates"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "email_template_category_enum"`);
  }
}
