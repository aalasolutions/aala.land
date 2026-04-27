import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsurePgTrgmAndLocationNameIndexes1774000000023 implements MigrationInterface {
    name = 'EnsurePgTrgmAndLocationNameIndexes1774000000023';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_cities_name_trgm"
            ON "cities" USING GIN ("name" gin_trgm_ops)
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_localities_name_trgm"
            ON "localities" USING GIN ("name" gin_trgm_ops)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_localities_name_trgm"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cities_name_trgm"`);
    }
}
