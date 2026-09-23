import { MigrationInterface, QueryRunner } from 'typeorm';

const CURRENCY_TABLES = [
  'cheques',
  'transactions',
  'commissions',
  'vendors',
  'leases',
  'work_orders',
];

// A money row's currency comes from its region, decided on create and again when
// a cheque, lease or work order moves to another region. USD is the column
// default and the fallback for a region the map does not know.
export class MoneyCurrencyAndLeaseRegion1779700000014 implements MigrationInterface {
  name = 'MoneyCurrencyAndLeaseRegion1779700000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of CURRENCY_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "currency" SET DEFAULT 'USD'`,
      );
    }

    // Nullable first, filled from the unit's city, then NOT NULL: the column has
    // no default, so an existing row needs a value before the constraint lands.
    // Replay-safe: TypeORM decides what is pending by migration NAME alone, so a
    // database may already carry this column and still be handed this migration.
    await queryRunner.query(
      `ALTER TABLE "leases" ADD COLUMN IF NOT EXISTS "region_code" varchar(50)`,
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
      `ALTER TABLE "leases" ALTER COLUMN "region_code" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_LEASES_REGION_CODE" ON "leases"("region_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_LEASES_REGION_CODE"`);
    await queryRunner.query(
      `ALTER TABLE "leases" DROP COLUMN IF EXISTS "region_code"`,
    );
    for (const table of CURRENCY_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "currency" SET DEFAULT 'AED'`,
      );
    }
  }
}
