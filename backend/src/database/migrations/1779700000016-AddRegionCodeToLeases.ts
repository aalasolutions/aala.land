import { MigrationInterface, QueryRunner } from 'typeorm';
import { regionCurrencySql } from '../../shared/utils/region-time.util';

// NOT NULL: a NULL would never match the region_code IN (...) read filter
export class AddRegionCodeToLeases1779700000016 implements MigrationInterface {
  name = 'AddRegionCodeToLeases1779700000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leases" ADD COLUMN "region_code" varchar(50)`,
    );

    await queryRunner.query(
      `UPDATE "leases" l SET "region_code" = ci."region_code"
       FROM "units" u
       JOIN "assets" a ON u."asset_id" = a."id"
       JOIN "localities" loc ON a."locality_id" = loc."id"
       JOIN "cities" ci ON loc."city_id" = ci."id"
       WHERE l."unit_id" = u."id"`,
    );

    await queryRunner.query(
      `UPDATE "leases" l SET "region_code" = co."default_region_code"
       FROM "companies" co
       WHERE l."region_code" IS NULL AND l."company_id" = co."id"
         AND co."default_region_code" IS NOT NULL`,
    );

    // Any company with no default at all still has to satisfy NOT NULL.
    await queryRunner.query(
      `UPDATE "leases" SET "region_code" = 'dubai' WHERE "region_code" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "leases" ALTER COLUMN "region_code" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_LEASES_REGION_CODE" ON "leases"("region_code")`,
    );

    // Only rows still on a column default move.
    const currency = regionCurrencySql('region_code', 'AED');
    await queryRunner.query(
      `UPDATE "leases" SET "currency" = ${currency} WHERE "currency" IN ('AED', 'USD') AND "currency" <> ${currency}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_LEASES_REGION_CODE"`);
    await queryRunner.query(
      `ALTER TABLE "leases" DROP COLUMN IF EXISTS "region_code"`,
    );
  }
}
