import { MigrationInterface, QueryRunner } from 'typeorm';

// Prevents duplicate daily reminders when the cron runs on multiple replicas
export class AddReminderDedupUniqueIndex1779500000044 implements MigrationInterface {
  name = 'AddReminderDedupUniqueIndex1779500000044';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notifications_reminder_dedup_daily" ` +
        `ON "notifications" ("company_id", "user_id", "type", "entity_id", (("created_at")::date)) ` +
        `WHERE "entity_id" IS NOT NULL ` +
        `AND "type" IN ('CHEQUE_DUE', 'CHEQUE_OVERDUE', 'CHEQUE_DELAYED', 'LEAD_UNASSIGNED')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_notifications_reminder_dedup_daily"`,
    );
  }
}
