import { MigrationInterface, QueryRunner } from 'typeorm';

// NO ACTION: a delete must clear these references first, matching the existing unit foreign keys.
const FOREIGN_KEYS: Array<
  [name: string, table: string, column: string, target: string]
> = [
  ['FK_work_orders_assigned_to', 'work_orders', 'assigned_to', 'users'],
  ['FK_leads_assigned_to', 'leads', 'assigned_to', 'users'],
  ['FK_commissions_lead', 'commissions', 'lead_id', 'leads'],
  [
    'FK_commissions_transaction',
    'commissions',
    'transaction_id',
    'transactions',
  ],
];

const NOT_NULL_COLUMNS: Array<[table: string, column: string]> = [
  ['companies', 'subscription_tier'],
  ['companies', 'max_users'],
  ['companies', 'max_regions'],
  ['companies', 'max_properties'],
  ['units', 'photos'],
];

const NO_DEFAULT_REGION_COLUMNS = ['vendors', 'commissions'];

const TIMESTAMP_DEFAULT_COLUMNS: Array<[table: string, column: string]> = [
  ['notifications', 'created_at'],
  ['notifications', 'updated_at'],
  ['audit_logs', 'created_at'],
];

export class FixSchemaGaps1779700000008 implements MigrationInterface {
  name = 'FixSchemaGaps1779700000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, table, column, target] of FOREIGN_KEYS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}") REFERENCES "${target}"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "lead_activities" ALTER COLUMN "notes" DROP NOT NULL`,
    );

    await queryRunner.query(
      `UPDATE "transactions" SET "status" = upper("status"::text)::"transactions_status_enum" WHERE "status"::text <> upper("status"::text)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_status_enum" RENAME TO "transactions_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_status_enum" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED', 'FAILED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "status" TYPE "public"."transactions_status_enum" USING "status"::text::"public"."transactions_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."transactions_status_enum_old"`,
    );

    for (const [table, column] of NOT_NULL_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`,
      );
    }

    for (const table of NO_DEFAULT_REGION_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "region_code" DROP DEFAULT`,
      );
    }

    for (const [table, column] of TIMESTAMP_DEFAULT_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT now()`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of [...TIMESTAMP_DEFAULT_COLUMNS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT CURRENT_TIMESTAMP`,
      );
    }

    for (const table of [...NO_DEFAULT_REGION_COLUMNS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "region_code" SET DEFAULT 'dubai'`,
      );
    }

    for (const [table, column] of [...NOT_NULL_COLUMNS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP NOT NULL`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_status_enum" RENAME TO "transactions_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_status_enum" AS ENUM('PENDING', 'pending', 'COMPLETED', 'completed', 'CANCELLED', 'cancelled', 'FAILED', 'failed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "status" TYPE "public"."transactions_status_enum" USING "status"::text::"public"."transactions_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."transactions_status_enum_old"`,
    );

    await queryRunner.query(
      `UPDATE "lead_activities" SET "notes" = '' WHERE "notes" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_activities" ALTER COLUMN "notes" SET NOT NULL`,
    );

    for (const [name, table] of [...FOREIGN_KEYS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`,
      );
    }
  }
}
