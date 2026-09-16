import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStorageQuotaNotifiedAtToCompanies1779500000055
  implements MigrationInterface
{
  name = 'AddStorageQuotaNotifiedAtToCompanies1779500000055';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Claims a 24h dedup window so repeated rejected uploads email at most once a day
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "storage_quota_notified_at" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" DROP COLUMN IF EXISTS "storage_quota_notified_at"`,
    );
  }
}
