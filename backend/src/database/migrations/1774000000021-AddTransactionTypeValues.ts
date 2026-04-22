import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionTypeValues1774000000021 implements MigrationInterface {
    name = 'AddTransactionTypeValues1774000000021';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add TransactionType enum values (INCOME, EXPENSE) to the existing transactions_type_enum
        await queryRunner.query(`ALTER TYPE "transactions_type_enum" ADD VALUE 'INCOME' BEFORE 'RENT'`);
        await queryRunner.query(`ALTER TYPE "transactions_type_enum" ADD VALUE 'EXPENSE' BEFORE 'RENT'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Note: PostgreSQL doesn't support removing enum values easily, so we leave them
    }
}
