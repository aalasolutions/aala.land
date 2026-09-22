import { MigrationInterface, QueryRunner } from 'typeorm';
import { regionCurrencySql } from '../../shared/utils/region-time.util';

const TABLES = ['cheques', 'transactions', 'commissions'];

export class MoneyRowsFollowRegionCurrency1779700000014 implements MigrationInterface {
  name = 'MoneyRowsFollowRegionCurrency1779700000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      const currency = regionCurrencySql('region_code', 'AED');
      await queryRunner.query(
        `UPDATE "${table}" SET "currency" = ${currency} WHERE "currency" = 'AED' AND "region_code" IS NOT NULL AND ${currency} <> 'AED'`,
      );
    }
  }

  public down(): Promise<void> {
    return Promise.resolve();
  }
}
