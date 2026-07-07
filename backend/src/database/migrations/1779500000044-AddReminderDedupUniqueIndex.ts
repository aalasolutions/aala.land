import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-level dedup backstop for the daily reminder cron (race audit 2026-07-07, P7).
 *
 * `NotificationsService.notifyAdminsOncePerDay` does a SELECT-then-INSERT dedup
 * with no unique constraint. On a single-process deploy the in-memory key set is
 * enough, but the moment the backend is horizontally scaled two replicas running
 * the 9AM cron both pass the SELECT and both INSERT, producing duplicate
 * reminders. This partial unique index makes a duplicate reminder physically
 * impossible: one row per (company, admin user, reminder type, entity) per day
 * bucket. The service switches its reminder insert to swallow the resulting
 * 23505 so the losing replica silently skips instead of erroring.
 *
 * Scoped to the four reminder types the cron emits (CHEQUE_DUE, CHEQUE_OVERDUE,
 * CHEQUE_DELAYED, LEAD_UNASSIGNED) so in-app notifications that are meant to
 * repeat (LEAD_ASSIGNED, LEAD_STATUS_CHANGED, etc.) are untouched. Day bucket is
 * `created_at::date`, matching the cron's once-per-day `startOfToday()` window.
 * `entity_id IS NOT NULL` keeps the index deterministic (reminders always carry
 * an entity id; NULLs would otherwise never collide).
 */
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
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_notifications_reminder_dedup_daily"`);
  }
}
