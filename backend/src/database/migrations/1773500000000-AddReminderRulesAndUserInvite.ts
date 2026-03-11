import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReminderRulesAndUserInvite1773500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add mustChangePassword to users
    const userCols = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
    );
    const userColumnNames = userCols.map((row: any) => row.column_name);

    if (!userColumnNames.includes('must_change_password')) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD "must_change_password" boolean NOT NULL DEFAULT false`,
      );
    }

    // 2. Create reminder_rules_type_enum if not exists
    const enumExists = await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'reminder_rules_type_enum'`,
    );
    if (enumExists.length === 0) {
      await queryRunner.query(
        `CREATE TYPE "reminder_rules_type_enum" AS ENUM ('RENT_DUE', 'LEASE_EXPIRY', 'MAINTENANCE_SCHEDULE', 'CHEQUE_DUE', 'CUSTOM')`,
      );
    }

    // 3. Create reminder_rules table if not exists
    const tableExists = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'reminder_rules'`,
    );
    if (tableExists.length === 0) {
      await queryRunner.query(`
        CREATE TABLE "reminder_rules" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "company_id" uuid NOT NULL,
          "name" varchar(255) NOT NULL,
          "type" "reminder_rules_type_enum" NOT NULL DEFAULT 'CUSTOM',
          "trigger_days_before" int NOT NULL,
          "is_active" boolean NOT NULL DEFAULT true,
          "message" text,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_reminder_rules" PRIMARY KEY ("id"),
          CONSTRAINT "FK_reminder_rules_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
        )
      `);

      await queryRunner.query(
        `CREATE INDEX "IDX_reminder_rules_company_id" ON "reminder_rules" ("company_id")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop reminder_rules table
    const tableExists = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'reminder_rules'`,
    );
    if (tableExists.length > 0) {
      await queryRunner.query(`DROP TABLE "reminder_rules"`);
    }

    // Drop enum
    const enumExists = await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'reminder_rules_type_enum'`,
    );
    if (enumExists.length > 0) {
      await queryRunner.query(`DROP TYPE "reminder_rules_type_enum"`);
    }

    // Remove mustChangePassword from users
    const userCols = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
    );
    const userColumnNames = userCols.map((row: any) => row.column_name);
    if (userColumnNames.includes('must_change_password')) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "must_change_password"`);
    }
  }
}
