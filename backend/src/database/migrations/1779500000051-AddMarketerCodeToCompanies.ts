import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * First-touch immutable attribution column, captured only at signup (register
 * and google-signup). Some environments already have this column and this
 * exact migration name recorded from an earlier run; IF NOT EXISTS lets fresh
 * and existing databases converge on the same schema.
 */
export class AddMarketerCodeToCompanies1779500000051 implements MigrationInterface {
  name = 'AddMarketerCodeToCompanies1779500000051';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "marketer_code" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "marketer_code"`,
    );
  }
}
