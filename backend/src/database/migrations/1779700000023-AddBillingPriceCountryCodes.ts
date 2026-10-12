import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingPriceCountryCodes1779700000023 implements MigrationInterface {
  name = 'AddBillingPriceCountryCodes1779700000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_prices" ADD COLUMN "country_codes" text[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_prices" ADD CONSTRAINT "CHK_billing_prices_country_codes_not_empty" CHECK ("country_codes" IS NULL OR cardinality("country_codes") > 0)`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_billing_prices_active"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_billing_prices_active" ON "billing_prices" ("kind", "currency") WHERE "active" = true AND "country_codes" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_billing_prices_active_override" ON "billing_prices" ("kind", "country_codes") WHERE "active" = true AND "country_codes" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_billing_prices_active_override"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_billing_prices_active"`);
    // Override rows have no meaning without the column and would break the old unique key.
    await queryRunner.query(
      `DELETE FROM "billing_prices" WHERE "country_codes" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_billing_prices_active" ON "billing_prices" ("kind", "currency") WHERE "active" = true`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_prices" DROP CONSTRAINT IF EXISTS "CHK_billing_prices_country_codes_not_empty"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_prices" DROP COLUMN IF EXISTS "country_codes"`,
    );
  }
}
