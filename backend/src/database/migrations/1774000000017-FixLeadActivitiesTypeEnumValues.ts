import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLeadActivitiesTypeEnumValues1774000000017 implements MigrationInterface {
  name = 'FixLeadActivitiesTypeEnumValues1774000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "lead_activities_type_enum" ADD VALUE 'CALL' BEFORE 'call'`,
    );
    await queryRunner.query(
      `ALTER TYPE "lead_activities_type_enum" ADD VALUE 'EMAIL' BEFORE 'email'`,
    );
    await queryRunner.query(
      `ALTER TYPE "lead_activities_type_enum" ADD VALUE 'WHATSAPP' BEFORE 'whatsapp'`,
    );
    await queryRunner.query(
      `ALTER TYPE "lead_activities_type_enum" ADD VALUE 'VIEWING' BEFORE 'viewing'`,
    );
    await queryRunner.query(
      `ALTER TYPE "lead_activities_type_enum" ADD VALUE 'NOTE' BEFORE 'note'`,
    );
    await queryRunner.query(
      `ALTER TYPE "lead_activities_type_enum" ADD VALUE 'STATUS_CHANGE' BEFORE 'status_change'`,
    );
    await queryRunner.query(
      `ALTER TYPE "lead_activities_type_enum" ADD VALUE 'ASSIGNMENT' BEFORE 'assignment'`,
    );

    // Casts through text: Postgres cannot compare/assign enum values directly.
    await queryRunner.query(
      `UPDATE "lead_activities" SET "type" = upper("type"::text)::lead_activities_type_enum`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "lead_activities" SET "type" = lower("type"::text)::lead_activities_type_enum`,
    );

    // PostgreSQL cannot remove enum values, so old lowercase values are left in place.
  }
}
