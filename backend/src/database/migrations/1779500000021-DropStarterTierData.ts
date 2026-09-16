import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropStarterTierData1779500000021 implements MigrationInterface {
  name = 'DropStarterTierData1779500000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Must run before the tier flip below, or this WHERE clause matches nothing
    await queryRunner.query(`
            UPDATE "companies"
               SET "max_users" = 1, "max_countries" = 1, "max_properties" = 25
             WHERE "subscription_tier" = 'STARTER'
        `);

    await queryRunner.query(
      `UPDATE "companies" SET "subscription_tier" = 'FREE' WHERE "subscription_tier" = 'STARTER'`,
    );
  }

  public async down(): Promise<void> {
    // Irreversible: former STARTER companies are not recorded anywhere
  }
}
