import { MigrationInterface, QueryRunner } from 'typeorm';

// Schedule values are calendar days entered without a time; they were stored as UTC midnight.
export class WorkOrderScheduleDatesToDate1779700000006 implements MigrationInterface {
  name = 'WorkOrderScheduleDatesToDate1779700000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_orders"
         ALTER COLUMN "scheduled_date" TYPE date USING ("scheduled_date" AT TIME ZONE 'UTC')::date,
         ALTER COLUMN "next_scheduled_date" TYPE date USING ("next_scheduled_date" AT TIME ZONE 'UTC')::date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_orders"
         ALTER COLUMN "scheduled_date" TYPE timestamptz USING "scheduled_date"::timestamp AT TIME ZONE 'UTC',
         ALTER COLUMN "next_scheduled_date" TYPE timestamptz USING "next_scheduled_date"::timestamp AT TIME ZONE 'UTC'`,
    );
  }
}
