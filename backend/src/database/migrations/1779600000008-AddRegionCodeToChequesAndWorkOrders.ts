import { MigrationInterface, QueryRunner } from 'typeorm';

// NOT NULL: both rows are company operations that belong to exactly one
// region. A NULL never matches the region_code IN (...) read filter, so it
// would hide the row from every region-confined user.
// Region is derivable through unit > asset > locality > city, and for a
// cheque also through its lease. Anything with neither link falls back to the
// company default.
export class AddRegionCodeToChequesAndWorkOrders1779600000008 implements MigrationInterface {
  name = 'AddRegionCodeToChequesAndWorkOrders1779600000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cheques" ADD COLUMN "region_code" varchar(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_orders" ADD COLUMN "region_code" varchar(50)`,
    );

    await queryRunner.query(
      `UPDATE "cheques" ch SET "region_code" = ci."region_code"
       FROM "units" u
       JOIN "assets" a ON u."asset_id" = a."id"
       JOIN "localities" loc ON a."locality_id" = loc."id"
       JOIN "cities" ci ON loc."city_id" = ci."id"
       WHERE ch."unit_id" = u."id"`,
    );

    await queryRunner.query(
      `UPDATE "cheques" ch SET "region_code" = ci."region_code"
       FROM "leases" l
       JOIN "units" u ON l."unit_id" = u."id"
       JOIN "assets" a ON u."asset_id" = a."id"
       JOIN "localities" loc ON a."locality_id" = loc."id"
       JOIN "cities" ci ON loc."city_id" = ci."id"
       WHERE ch."region_code" IS NULL AND ch."lease_id" = l."id"`,
    );

    await queryRunner.query(
      `UPDATE "cheques" ch SET "region_code" = co."default_region_code"
       FROM "companies" co
       WHERE ch."region_code" IS NULL AND ch."company_id" = co."id"
         AND co."default_region_code" IS NOT NULL`,
    );

    // Any company with no default at all still has to satisfy NOT NULL.
    await queryRunner.query(
      `UPDATE "cheques" SET "region_code" = 'dubai' WHERE "region_code" IS NULL`,
    );

    await queryRunner.query(
      `UPDATE "work_orders" wo SET "region_code" = ci."region_code"
       FROM "units" u
       JOIN "assets" a ON u."asset_id" = a."id"
       JOIN "localities" loc ON a."locality_id" = loc."id"
       JOIN "cities" ci ON loc."city_id" = ci."id"
       WHERE wo."unit_id" = u."id"`,
    );

    await queryRunner.query(
      `UPDATE "work_orders" wo SET "region_code" = co."default_region_code"
       FROM "companies" co
       WHERE wo."region_code" IS NULL AND wo."company_id" = co."id"
         AND co."default_region_code" IS NOT NULL`,
    );

    await queryRunner.query(
      `UPDATE "work_orders" SET "region_code" = 'dubai' WHERE "region_code" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "cheques" ALTER COLUMN "region_code" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_orders" ALTER COLUMN "region_code" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_CHEQUES_REGION_CODE" ON "cheques"("region_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_WORK_ORDERS_REGION_CODE" ON "work_orders"("region_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_WORK_ORDERS_REGION_CODE"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CHEQUES_REGION_CODE"`);
    await queryRunner.query(
      `ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "region_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cheques" DROP COLUMN IF EXISTS "region_code"`,
    );
  }
}
