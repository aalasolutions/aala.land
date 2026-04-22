import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionDateToTransactions1774000000009 implements MigrationInterface {
    name = 'AddTransactionDateToTransactions1774000000009';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add missing transaction_date column to transactions table
        await queryRunner.query(`ALTER TABLE "transactions" ADD COLUMN "transaction_date" date`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the column
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "transaction_date"`);
    }
}
