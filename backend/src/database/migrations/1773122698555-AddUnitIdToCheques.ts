import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnitIdToCheques1773122698555 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name = 'cheques' AND column_name = 'unit_id'`,
        );
        if (!hasColumn.length) {
            await queryRunner.query(`ALTER TABLE "cheques" ADD "unit_id" uuid`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cheques" DROP COLUMN IF EXISTS "unit_id"`);
    }
}
