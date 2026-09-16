import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTransactionsCategoryEnumValues1774000000020 implements MigrationInterface {
  name = 'FixTransactionsCategoryEnumValues1774000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The category column is text, not an enum, so casing must be normalized manually.
    await queryRunner.query(
      `UPDATE "transactions" SET "category" = upper("category"::text) WHERE "category" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "transactions" SET "category" = lower("category"::text) WHERE "category" IS NOT NULL`,
    );
  }
}
