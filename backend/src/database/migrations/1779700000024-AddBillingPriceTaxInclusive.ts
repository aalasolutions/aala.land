import { MigrationInterface, QueryRunner } from 'typeorm';

// Tax inside the amount is the default; false adds it on top at checkout.
export class AddBillingPriceTaxInclusive1779700000024 implements MigrationInterface {
  name = 'AddBillingPriceTaxInclusive1779700000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_prices" ADD COLUMN "tax_inclusive" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_prices" DROP COLUMN IF EXISTS "tax_inclusive"`,
    );
  }
}
