import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingNotificationTypes1774000000024 implements MigrationInterface {
  name = 'AddMissingNotificationTypes1774000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'LEAD_UNASSIGNED'`);
    await queryRunner.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'CHEQUE_BOUNCED'`);
    await queryRunner.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'CHEQUE_OVERDUE'`);
    await queryRunner.query(`ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'CHEQUE_DELAYED'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support removing values from an enum type easily.
    // Usually, we don't revert enum value additions.
  }
}
