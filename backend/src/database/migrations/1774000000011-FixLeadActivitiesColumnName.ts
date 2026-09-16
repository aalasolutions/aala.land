import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLeadActivitiesColumnName1774000000011 implements MigrationInterface {
  name = 'FixLeadActivitiesColumnName1774000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Matches the LeadActivity entity's column name.
    await queryRunner.query(
      `ALTER TABLE "lead_activities" RENAME COLUMN "description" TO "notes"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lead_activities" RENAME COLUMN "notes" TO "description"`,
    );
  }
}
