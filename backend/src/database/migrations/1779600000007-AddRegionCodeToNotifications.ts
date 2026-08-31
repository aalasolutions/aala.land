import { MigrationInterface, QueryRunner } from 'typeorm';

// Nullable: region here is a relevance filter, not a security boundary.
// NULL means company-wide and stays visible in every region.
export class AddRegionCodeToNotifications1779600000007 implements MigrationInterface {
  name = 'AddRegionCodeToNotifications1779600000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN "region_code" varchar(50)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_NOTIFICATIONS_REGION_CODE" ON "notifications"("region_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_NOTIFICATIONS_REGION_CODE"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "region_code"`,
    );
  }
}
