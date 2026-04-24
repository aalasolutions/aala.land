import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuildingsNameTrgmIndex1774000000024 implements MigrationInterface {
    name = 'AddBuildingsNameTrgmIndex1774000000024';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_buildings_name_trgm"
            ON "buildings" USING GIN ("name" gin_trgm_ops)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_buildings_name_trgm"`);
    }
}
