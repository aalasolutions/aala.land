import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeadPipelineAnalytics1773500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add stage_entered_at column
    const hasStageEnteredAt = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name = 'stage_entered_at'
    `);
    if (hasStageEnteredAt.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "leads" ADD COLUMN "stage_entered_at" TIMESTAMP WITH TIME ZONE
      `);
    }

    // Add transfer_reason column
    const hasTransferReason = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name = 'transfer_reason'
    `);
    if (hasTransferReason.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "leads" ADD COLUMN "transfer_reason" VARCHAR(500)
      `);
    }

    // Add previous_agent column
    const hasPreviousAgent = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name = 'previous_agent'
    `);
    if (hasPreviousAgent.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "leads" ADD COLUMN "previous_agent" UUID
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasPreviousAgent = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name = 'previous_agent'
    `);
    if (hasPreviousAgent.length > 0) {
      await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "previous_agent"`);
    }

    const hasTransferReason = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name = 'transfer_reason'
    `);
    if (hasTransferReason.length > 0) {
      await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "transfer_reason"`);
    }

    const hasStageEnteredAt = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name = 'stage_entered_at'
    `);
    if (hasStageEnteredAt.length > 0) {
      await queryRunner.query(`ALTER TABLE "leads" DROP COLUMN "stage_entered_at"`);
    }
  }
}
