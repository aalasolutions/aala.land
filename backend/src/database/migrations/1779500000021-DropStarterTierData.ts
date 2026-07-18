import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropStarterTierData1779500000021 implements MigrationInterface {
  name = 'DropStarterTierData1779500000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sync the enforcement columns for the rows about to move, using the FREE
    // values from TIER_LIMITS (enforcement reads the per-company columns, not
    // the constant). Runs BEFORE the tier flip so the WHERE clause still matches.
    await queryRunner.query(`
            UPDATE "companies"
               SET "max_users" = 1, "max_countries" = 1, "max_properties" = 25
             WHERE "subscription_tier" = 'STARTER'
        `);

    // Contract section 11 statement, verbatim.
    await queryRunner.query(
      `UPDATE "companies" SET "subscription_tier" = 'FREE' WHERE "subscription_tier" = 'STARTER'`,
    );
  }

  public async down(): Promise<void> {
    // Irreversible data migration: the set of former STARTER companies is not
    // recorded anywhere. Greenfield decision (contract section 2), no restore path.
  }
}
