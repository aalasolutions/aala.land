import { MigrationInterface, QueryRunner } from 'typeorm';

// First-touch attribution, captured only at signup, immutable after
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
