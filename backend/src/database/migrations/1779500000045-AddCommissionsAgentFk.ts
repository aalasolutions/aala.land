import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Database backstop for the commission-orphan race (race audit 2026-07-07, P3).
 *
 * deleteUserWithReassignment blocks a delete when the target carries non-PENDING
 * commissions, re-counting inside the locked transaction. But that check is still
 * a read; a commission that flips PENDING->APPROVED (or a brand-new APPROVED row)
 * committed by another connection AFTER the count, yet BEFORE this txn's
 * manager.delete(User), would slip past. reassignOwnedRecords only moves PENDING
 * commissions, so the newly-APPROVED one keeps agent_id pointing at a deleted user.
 *
 * commissions.agent_id is NOT NULL and, until now, had NO foreign key (only a
 * company_id FK existed on the table). This adds:
 *
 *   FK_commissions_agent_users: agent_id -> users(id) ON DELETE RESTRICT
 *
 * With ON DELETE RESTRICT, deleting a user still referenced by ANY commission
 * fails at the database (SQLSTATE 23503), which aborts and rolls back the entire
 * removal transaction instead of orphaning the commission. The service catches
 * 23503 and rethrows a 409 ConflictException.
 *
 * up() is guarded with a pg_constraint existence check so re-runs are safe.
 * If up() fails with a 23503 here, existing data already has a commission whose
 * agent_id points at a missing user; that orphan must be resolved before the FK
 * can be created (the audit verified 0 orphan rows exist today).
 */
export class AddCommissionsAgentFk1779500000045 implements MigrationInterface {
  name = 'AddCommissionsAgentFk1779500000045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_commissions_agent_users'
        ) THEN
          ALTER TABLE "commissions"
            ADD CONSTRAINT "FK_commissions_agent_users"
            FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "commissions" DROP CONSTRAINT IF EXISTS "FK_commissions_agent_users"`,
    );
  }
}
