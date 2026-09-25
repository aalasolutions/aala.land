import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropAssetPropertyType1779700000017 implements MigrationInterface {
  name = 'DropAssetPropertyType1779700000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assets" DROP COLUMN IF EXISTS "property_type"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "assets_property_type_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "assets_property_type_enum" AS ENUM ('RENTAL', 'FOR_SALE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" ADD COLUMN "property_type" "assets_property_type_enum" NOT NULL DEFAULT 'RENTAL'`,
    );
  }
}
