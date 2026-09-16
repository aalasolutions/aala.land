import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLeadTemperatureEnumValues1774000000015 implements MigrationInterface {
  name = 'FixLeadTemperatureEnumValues1774000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "leads_temperature_enum" ADD VALUE 'HOT' BEFORE 'hot'`,
    );
    await queryRunner.query(
      `ALTER TYPE "leads_temperature_enum" ADD VALUE 'WARM' BEFORE 'warm'`,
    );
    await queryRunner.query(
      `ALTER TYPE "leads_temperature_enum" ADD VALUE 'COLD' BEFORE 'cold'`,
    );
    await queryRunner.query(
      `ALTER TYPE "leads_temperature_enum" ADD VALUE 'DEAD' BEFORE 'dead'`,
    );

    // Casts through text: Postgres cannot compare/assign enum values directly.
    await queryRunner.query(
      `UPDATE "leads" SET "temperature" = upper("temperature"::text)::leads_temperature_enum`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "leads" SET "temperature" = 'hot' WHERE "temperature" = 'HOT'`,
    );
    await queryRunner.query(
      `UPDATE "leads" SET "temperature" = 'warm' WHERE "temperature" = 'WARM'`,
    );
    await queryRunner.query(
      `UPDATE "leads" SET "temperature" = 'cold' WHERE "temperature" = 'COLD'`,
    );
    await queryRunner.query(
      `UPDATE "leads" SET "temperature" = 'dead' WHERE "temperature" = 'DEAD'`,
    );

    // PostgreSQL cannot remove enum values, so old lowercase values are left in place.
  }
}
