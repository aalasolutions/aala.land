import { MigrationInterface, QueryRunner } from 'typeorm';

// Contacts had no region link at all. Backfilled from each company's own
// default rather than a hardcoded region, which is what the older
// AddRegionCodeToVendors/Commissions migrations did.
export class AddRegionCodeToContacts1779600000003
  implements MigrationInterface
{
  name = 'AddRegionCodeToContacts1779600000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN "region_code" varchar(50)`,
    );

    await queryRunner.query(
      `UPDATE "contacts" c SET "region_code" = co."default_region_code"
       FROM "companies" co
       WHERE c."company_id" = co."id" AND co."default_region_code" IS NOT NULL`,
    );

    // Any company with no default at all still has to satisfy NOT NULL.
    await queryRunner.query(
      `UPDATE "contacts" SET "region_code" = 'dubai' WHERE "region_code" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "contacts" ALTER COLUMN "region_code" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CONTACTS_REGION_CODE" ON "contacts"("region_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONTACTS_REGION_CODE"`);
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN IF EXISTS "region_code"`,
    );
  }
}
