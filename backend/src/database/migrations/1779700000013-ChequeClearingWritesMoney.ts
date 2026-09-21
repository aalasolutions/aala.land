import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChequeClearingWritesMoney1779700000013 implements MigrationInterface {
  name = 'ChequeClearingWritesMoney1779700000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cheques" ADD COLUMN IF NOT EXISTS "cleared_date" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "cheque_id" uuid`,
    );
    // RESTRICT, not CASCADE: money rows are never removed by a parent delete.
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'FK_transactions_cheque'
         ) THEN
           ALTER TABLE "transactions"
             ADD CONSTRAINT "FK_transactions_cheque"
             FOREIGN KEY ("cheque_id") REFERENCES "cheques"("id")
             ON DELETE RESTRICT ON UPDATE NO ACTION;
         END IF;
       END $$`,
    );
    // The double-clear guard. CANCELLED rows are excluded so a cheque can be
    // un-cleared and cleared again without the reversed row blocking it.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_TRANSACTIONS_ACTIVE_CHEQUE" ON "transactions" ("cheque_id") WHERE "cheque_id" IS NOT NULL AND "status" <> 'CANCELLED'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_TRANSACTIONS_CHEQUE_ID" ON "transactions" ("cheque_id") WHERE "cheque_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_TRANSACTIONS_CHEQUE_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_TRANSACTIONS_ACTIVE_CHEQUE"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "FK_transactions_cheque"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "cheque_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cheques" DROP COLUMN IF EXISTS "cleared_date"`,
    );
  }
}
