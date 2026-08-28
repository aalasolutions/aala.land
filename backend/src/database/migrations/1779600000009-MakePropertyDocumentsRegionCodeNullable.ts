import { MigrationInterface, QueryRunner } from 'typeorm';

// NULL means company-wide and stays visible in every region, matching
// audit_logs and notifications. A company-level document such as a trade
// licence belongs to no single region.
// Existing rows keep the region they were stamped with: clearing them would
// widen who can see them.
export class MakePropertyDocumentsRegionCodeNullable1779600000009 implements MigrationInterface {
  name = 'MakePropertyDocumentsRegionCodeNullable1779600000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "property_documents" ALTER COLUMN "region_code" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // NULLs must go before NOT NULL can be restored. Same derivation order as
    // 1779600000004: unit chain, asset chain, company default, then dubai.
    await queryRunner.query(
      `UPDATE "property_documents" d SET "region_code" = ci."region_code"
       FROM "units" u
       JOIN "assets" a ON u."asset_id" = a."id"
       JOIN "localities" loc ON a."locality_id" = loc."id"
       JOIN "cities" ci ON loc."city_id" = ci."id"
       WHERE d."region_code" IS NULL AND d."unit_id" = u."id"`,
    );

    await queryRunner.query(
      `UPDATE "property_documents" d SET "region_code" = ci."region_code"
       FROM "assets" a
       JOIN "localities" loc ON a."locality_id" = loc."id"
       JOIN "cities" ci ON loc."city_id" = ci."id"
       WHERE d."region_code" IS NULL AND d."asset_id" = a."id"`,
    );

    await queryRunner.query(
      `UPDATE "property_documents" d SET "region_code" = co."default_region_code"
       FROM "companies" co
       WHERE d."region_code" IS NULL AND d."company_id" = co."id"
         AND co."default_region_code" IS NOT NULL`,
    );

    await queryRunner.query(
      `UPDATE "property_documents" SET "region_code" = 'dubai' WHERE "region_code" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "property_documents" ALTER COLUMN "region_code" SET NOT NULL`,
    );
  }
}
