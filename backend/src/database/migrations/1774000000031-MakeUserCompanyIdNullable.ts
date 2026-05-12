import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUserCompanyIdNullable1774000000031 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "company_id" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Intentionally irreversible: after `up()` runs, rows may legitimately exist with
        // `company_id = NULL` (for example, accounts that do not belong to a company).
        // Restoring the NOT NULL constraint here without a data backfill/delete strategy
        // would cause rollback failures or require unsafe assumptions about valid values.
        void queryRunner;
    }
}
