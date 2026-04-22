import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLeadActivitiesColumnName1774000000011 implements MigrationInterface {
    name = 'FixLeadActivitiesColumnName1774000000011';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Rename description column to notes to match entity expectation
        await queryRunner.query(`ALTER TABLE "lead_activities" RENAME COLUMN "description" TO "notes"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert the change
        await queryRunner.query(`ALTER TABLE "lead_activities" RENAME COLUMN "notes" TO "description"`);
    }
}
