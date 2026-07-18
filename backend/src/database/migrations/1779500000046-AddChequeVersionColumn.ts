import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optimistic-lock version column on cheques (race audit 2026-07-07, P4).
 *
 * The cheque update() path previously guarded only status transitions
 * (WHERE status = :oldStatus). A concurrent non-status edit (amount/notes/
 * unitId) that left status unchanged fell through to a plain save() and was
 * clobbered last-write-wins. This column backs a single guarded conditional
 * UPDATE for BOTH status and non-status edits (WHERE version = :version,
 * SET version = version + 1), so any concurrent edit in either direction is
 * detected and rejected.
 *
 * A plain integer column (guarded manually in the service), not a TypeORM
 * @VersionColumn, so we control the compare-and-set explicitly.
 */
export class AddChequeVersionColumn1779500000046 implements MigrationInterface {
  name = 'AddChequeVersionColumn1779500000046';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cheques" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cheques" DROP COLUMN IF EXISTS "version"`,
    );
  }
}
