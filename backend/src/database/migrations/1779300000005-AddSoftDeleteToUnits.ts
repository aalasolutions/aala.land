import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteToUnits1779300000005 implements MigrationInterface {
  name = 'AddSoftDeleteToUnits1779300000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "units" ADD "deleted_at" TIMESTAMPTZ`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "units" DROP COLUMN "deleted_at"`);
  }
}
