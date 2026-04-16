import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTransactionsStatusEnumValues1774000000018 implements MigrationInterface {
    name = 'FixTransactionsStatusEnumValues1774000000018';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add new uppercase values to the enum
        await queryRunner.query(`ALTER TYPE "transactions_status_enum" ADD VALUE 'PENDING' BEFORE 'pending'`);
        await queryRunner.query(`ALTER TYPE "transactions_status_enum" ADD VALUE 'COMPLETED' BEFORE 'completed'`);
        await queryRunner.query(`ALTER TYPE "transactions_status_enum" ADD VALUE 'CANCELLED' BEFORE 'cancelled'`);
        await queryRunner.query(`ALTER TYPE "transactions_status_enum" ADD VALUE 'FAILED' BEFORE 'failed'`);

        // Update existing data to use uppercase values using text conversion workaround
        await queryRunner.query(`UPDATE "transactions" SET "status" = upper("status"::text)::transactions_status_enum`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert data changes
        await queryRunner.query(`UPDATE "transactions" SET "status" = lower("status"::text)::transactions_status_enum`);

        // Note: PostgreSQL doesn't support removing enum values easily, so we leave them
    }
}
