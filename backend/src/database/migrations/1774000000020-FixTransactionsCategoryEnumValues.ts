import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTransactionsCategoryEnumValues1774000000020 implements MigrationInterface {
    name = 'FixTransactionsCategoryEnumValues1774000000020';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // The category column appears to use text type in the database, but let's ensure consistency
        // Update existing data to use uppercase values for consistency
        await queryRunner.query(`UPDATE "transactions" SET "category" = upper("category"::text) WHERE "category" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert data changes
        await queryRunner.query(`UPDATE "transactions" SET "category" = lower("category"::text) WHERE "category" IS NOT NULL`);
    }
}
