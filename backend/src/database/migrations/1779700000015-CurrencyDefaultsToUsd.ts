import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = [
  'cheques',
  'transactions',
  'commissions',
  'vendors',
  'leases',
  'work_orders',
];

export class CurrencyDefaultsToUsd1779700000015 implements MigrationInterface {
  name = 'CurrencyDefaultsToUsd1779700000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "currency" SET DEFAULT 'USD'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "currency" SET DEFAULT 'AED'`,
      );
    }
  }
}
