import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeadPosition1779700000015 implements MigrationInterface {
  name = 'AddLeadPosition1779700000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "position" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leads" DROP COLUMN IF EXISTS "position"`,
    );
  }
}
