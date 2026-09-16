import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTransactionsTypeEnumValues1774000000019 implements MigrationInterface {
  name = 'FixTransactionsTypeEnumValues1774000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "transactions_type_enum" ADD VALUE 'RENT' BEFORE 'rent'`,
    );
    await queryRunner.query(
      `ALTER TYPE "transactions_type_enum" ADD VALUE 'SALE' BEFORE 'sale'`,
    );
    await queryRunner.query(
      `ALTER TYPE "transactions_type_enum" ADD VALUE 'DEPOSIT' BEFORE 'deposit'`,
    );
    await queryRunner.query(
      `ALTER TYPE "transactions_type_enum" ADD VALUE 'MAINTENANCE' BEFORE 'maintenance'`,
    );
    await queryRunner.query(
      `ALTER TYPE "transactions_type_enum" ADD VALUE 'COMMISSION' BEFORE 'commission'`,
    );
    await queryRunner.query(
      `ALTER TYPE "transactions_type_enum" ADD VALUE 'OTHER' BEFORE 'other'`,
    );

    // Casts through text: Postgres cannot compare/assign enum values directly.
    await queryRunner.query(
      `UPDATE "transactions" SET "type" = upper("type"::text)::transactions_type_enum`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "transactions" SET "type" = lower("type"::text)::transactions_type_enum`,
    );

    // PostgreSQL cannot remove enum values, so old lowercase values are left in place.
  }
}
