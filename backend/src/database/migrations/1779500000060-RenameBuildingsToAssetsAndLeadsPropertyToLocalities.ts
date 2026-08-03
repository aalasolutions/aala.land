import { MigrationInterface, QueryRunner } from 'typeorm';

// Pure renames, no data move. The TS side already speaks "asset" and the lead
// relation already targets localities; only the DB column and table names lied.
//   1. buildings renamed to assets; building_id renamed to asset_id on
//      units, property_media, property_documents
//   2. leads.property_id renamed to locality_id, plus its FK and index
export class RenameBuildingsToAssetsAndLeadsPropertyToLocalities1779500000060 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. buildings renamed to assets
    await queryRunner.query(`ALTER TABLE "buildings" RENAME TO "assets"`);
    await queryRunner.query(
      `ALTER TABLE "units" RENAME COLUMN "building_id" TO "asset_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_media" RENAME COLUMN "building_id" TO "asset_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_documents" RENAME COLUMN "building_id" TO "asset_id"`,
    );

    // 2. leads.property_id renamed to locality_id (+ FK + index)
    await queryRunner.query(
      `ALTER TABLE "leads" RENAME COLUMN "property_id" TO "locality_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" RENAME CONSTRAINT "fk_leads_property" TO "fk_leads_locality"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_LEADS_PROPERTY_ID" RENAME TO "IDX_LEADS_LOCALITY_ID"`,
    );

    // 3. Dependent objects that still carried the old name: the locality FK,
    //    NOT NULL checks, the name indexes, and the property_type enum.
    //    PostgreSQL keeps them valid through a table rename, but the schema must
    //    read "asset" so a later migration referencing FK_assets_locality cannot
    //    fail. assets_locality_id_not_null also drops a stale "area_id" label.
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "FK_buildings_locality" TO "FK_assets_locality"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "buildings_area_id_not_null" TO "assets_locality_id_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "buildings_company_id_not_null" TO "assets_company_id_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "buildings_created_at_not_null" TO "assets_created_at_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "buildings_id_not_null" TO "assets_id_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "buildings_name_not_null" TO "assets_name_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "buildings_property_type_not_null" TO "assets_property_type_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "buildings_updated_at_not_null" TO "assets_updated_at_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" RENAME CONSTRAINT "units_building_id_not_null" TO "units_asset_id_not_null"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_buildings_name_trgm" RENAME TO "IDX_assets_name_trgm"`,
    );
    await queryRunner.query(
      `ALTER INDEX "idx_buildings_name_lower" RENAME TO "idx_assets_name_lower"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_buildings_locality_normalized_name_unique" RENAME TO "IDX_assets_locality_normalized_name_unique"`,
    );
    await queryRunner.query(
      `ALTER TYPE "buildings_property_type_enum" RENAME TO "assets_property_type_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "assets_property_type_enum" RENAME TO "buildings_property_type_enum"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_assets_locality_normalized_name_unique" RENAME TO "IDX_buildings_locality_normalized_name_unique"`,
    );
    await queryRunner.query(
      `ALTER INDEX "idx_assets_name_lower" RENAME TO "idx_buildings_name_lower"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_assets_name_trgm" RENAME TO "IDX_buildings_name_trgm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" RENAME CONSTRAINT "units_asset_id_not_null" TO "units_building_id_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "assets_updated_at_not_null" TO "buildings_updated_at_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "assets_property_type_not_null" TO "buildings_property_type_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "assets_name_not_null" TO "buildings_name_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "assets_id_not_null" TO "buildings_id_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "assets_created_at_not_null" TO "buildings_created_at_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "assets_company_id_not_null" TO "buildings_company_id_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "assets_locality_id_not_null" TO "buildings_area_id_not_null"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" RENAME CONSTRAINT "FK_assets_locality" TO "FK_buildings_locality"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_LEADS_LOCALITY_ID" RENAME TO "IDX_LEADS_PROPERTY_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" RENAME CONSTRAINT "fk_leads_locality" TO "fk_leads_property"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" RENAME COLUMN "locality_id" TO "property_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "property_documents" RENAME COLUMN "asset_id" TO "building_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_media" RENAME COLUMN "asset_id" TO "building_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" RENAME COLUMN "asset_id" TO "building_id"`,
    );
    await queryRunner.query(`ALTER TABLE "assets" RENAME TO "buildings"`);
  }
}
