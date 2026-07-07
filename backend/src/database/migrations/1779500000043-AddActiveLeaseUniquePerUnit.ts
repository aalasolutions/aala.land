import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hard backstop for the lease lifecycle race (race audit 2026-07-07, P4-lease).
 *
 * renew/terminate/update are check-then-act read-modify-save flows: two
 * concurrent renews on the same unit could each pass the "is ACTIVE" guard and
 * flip/create leases, leaving two ACTIVE leases on one unit under Postgres READ
 * COMMITTED. The service now serializes those transitions with a FOR UPDATE row
 * lock and re-checks the invariant under it. This partial unique index is the
 * database backstop that makes a second ACTIVE lease on a unit physically
 * impossible even if a future write path forgets the lock.
 *
 * Partial (WHERE status = 'ACTIVE') so DRAFT / EXPIRED / TERMINATED / RENEWED
 * leases — which legitimately accumulate many rows per unit — are exempt.
 *
 * If this migration fails on `up` with a unique-violation, existing data already
 * has a unit with more than one ACTIVE lease; that duplication must be resolved
 * (terminate/expire the extras) before the index can be created.
 */
export class AddActiveLeaseUniquePerUnit1779500000043 implements MigrationInterface {
  name = 'AddActiveLeaseUniquePerUnit1779500000043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leases_active_unit" ` +
        `ON "leases" ("unit_id") WHERE "status" = 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_leases_active_unit"`);
  }
}
