import { MigrationInterface, QueryRunner } from 'typeorm';

// Region is derivable through unit > asset > locality > city. Anything not
// linked to a property falls back to the company default.
export class AddRegionCodeToPropertyDocuments1779600000004 implements MigrationInterface {
  name = 'AddRegionCodeToPropertyDocuments1779600000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "property_documents" ADD COLUMN "region_code" varchar(50)`,
    );

    await queryRunner.query(
      `UPDATE "property_documents" d SET "region_code" = ci."region_code"
       FROM "units" u
       JOIN "assets" a ON u."asset_id" = a."id"
       JOIN "localities" loc ON a."locality_id" = loc."id"
       JOIN "cities" ci ON loc."city_id" = ci."id"
       WHERE d."unit_id" = u."id"`,
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
    await queryRunner.query(
      `CREATE INDEX "IDX_PROPERTY_DOCUMENTS_REGION_CODE" ON "property_documents"("region_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_PROPERTY_DOCUMENTS_REGION_CODE"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_documents" DROP COLUMN IF EXISTS "region_code"`,
    );
  }
}
