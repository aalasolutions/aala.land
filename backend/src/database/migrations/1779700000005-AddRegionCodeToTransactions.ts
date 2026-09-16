import { MigrationInterface, QueryRunner } from 'typeorm';

// Nullable: a unit-less transaction has no region, stays hidden until Show All
export class AddRegionCodeToTransactions1779700000005
  implements MigrationInterface
{
  name = 'AddRegionCodeToTransactions1779700000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN "region_code" varchar(50)`,
    );

    await queryRunner.query(
      `UPDATE "transactions" t SET "region_code" = ci."region_code"
       FROM "units" u
       JOIN "assets" a ON u."asset_id" = a."id"
       JOIN "localities" loc ON a."locality_id" = loc."id"
       JOIN "cities" ci ON loc."city_id" = ci."id"
       WHERE t."unit_id" = u."id"`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_TRANSACTIONS_REGION_CODE" ON "transactions"("region_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_TRANSACTIONS_REGION_CODE"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "region_code"`,
    );
  }
}
