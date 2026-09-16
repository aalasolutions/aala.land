import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionTypeValues1774000000021 implements MigrationInterface {
  name = 'AddTransactionTypeValues1774000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "transactions_type_enum" ADD VALUE 'INCOME' BEFORE 'RENT'`,
    );
    await queryRunner.query(
      `ALTER TYPE "transactions_type_enum" ADD VALUE 'EXPENSE' BEFORE 'RENT'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot remove enum values, so old values are left in place.
  }
}
