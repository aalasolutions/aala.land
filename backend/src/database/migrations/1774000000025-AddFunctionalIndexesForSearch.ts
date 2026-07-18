import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFunctionalIndexesForSearch1774000000025 implements MigrationInterface {
  name = 'AddFunctionalIndexesForSearch1774000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_users_name_lower ON users (LOWER(name))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_buildings_name_lower ON buildings (LOWER(name))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_cities_name_lower ON cities (LOWER(name))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_localities_name_lower ON localities (LOWER(name))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_name_lower`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_buildings_name_lower`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cities_name_lower`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_localities_name_lower`);
  }
}
