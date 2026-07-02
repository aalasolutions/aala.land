import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropUserCurrencyColumn1779300000004 implements MigrationInterface {
  name = 'DropUserCurrencyColumn1779300000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "currency"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "currency" varchar(3) NOT NULL DEFAULT 'AED'`);
  }
}
