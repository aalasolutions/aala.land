import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmenitiesToUnits1773200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name = 'units' AND column_name = 'amenities'`,
        );
        if (!hasColumn.length) {
            await queryRunner.query(`ALTER TABLE "units" ADD "amenities" jsonb NOT NULL DEFAULT '[]'`);
        }
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_units_amenities" ON "units" USING GIN ("amenities")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_units_amenities"`);
        await queryRunner.query(`ALTER TABLE "units" DROP COLUMN IF EXISTS "amenities"`);
    }
}
