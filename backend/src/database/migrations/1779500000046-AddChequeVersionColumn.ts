import { MigrationInterface, QueryRunner } from 'typeorm';

// Plain integer, not @VersionColumn, so the service controls the compare-and-set
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
