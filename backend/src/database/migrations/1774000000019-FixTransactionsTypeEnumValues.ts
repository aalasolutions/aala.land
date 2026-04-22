import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTransactionsTypeEnumValues1774000000019 implements MigrationInterface {
    name = 'FixTransactionsTypeEnumValues1774000000019';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add new uppercase values to the enum
        await queryRunner.query(`ALTER TYPE "transactions_type_enum" ADD VALUE 'RENT' BEFORE 'rent'`);
        await queryRunner.query(`ALTER TYPE "transactions_type_enum" ADD VALUE 'SALE' BEFORE 'sale'`);
        await queryRunner.query(`ALTER TYPE "transactions_type_enum" ADD VALUE 'DEPOSIT' BEFORE 'deposit'`);
        await queryRunner.query(`ALTER TYPE "transactions_type_enum" ADD VALUE 'MAINTENANCE' BEFORE 'maintenance'`);
        await queryRunner.query(`ALTER TYPE "transactions_type_enum" ADD VALUE 'COMMISSION' BEFORE 'commission'`);
        await queryRunner.query(`ALTER TYPE "transactions_type_enum" ADD VALUE 'OTHER' BEFORE 'other'`);

        // Update existing data to use uppercase values using text conversion workaround
        await queryRunner.query(`UPDATE "transactions" SET "type" = upper("type"::text)::transactions_type_enum`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert data changes
        await queryRunner.query(`UPDATE "transactions" SET "type" = lower("type"::text)::transactions_type_enum`);

        // Note: PostgreSQL doesn't support removing enum values easily, so we leave them
    }
}
