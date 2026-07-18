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
 * `(created_at)::date`. `created_at` is `timestamp without time zone`; TypeORM's
 * @CreateDateColumn writes `new Date()` which the pg driver serializes to the
 * UTC wall-clock, so the stored value is already UTC and `(created_at)::date`
 * yields the UTC calendar date. This casts a plain timestamp to date, which is
 * IMMUTABLE (no session-timezone dependency), so Postgres accepts it in the
 * index expression. The earlier `(created_at AT TIME ZONE 'UTC')::date` produced
 * an identical bucket but is only STABLE (its `::date` cast reads the session
 * timezone), which Postgres rejects with "functions in index expression must be
 * marked IMMUTABLE". The cron's dedup prefilter uses a matching UTC start-of-day
 * window (`startOfUtcToday()`); both sides must agree or a duplicate could slip
 * past the prefilter near midnight and then lose to a swallowed 23505.
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
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_notifications_reminder_dedup_daily"`,
    );
  }
}
