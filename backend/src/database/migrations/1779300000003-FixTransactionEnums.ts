import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTransactionEnums1779300000003 implements MigrationInterface {
  name = 'FixTransactionEnums1779300000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure type column only has INCOME/EXPENSE before we recreate the enum
    await queryRunner.query(
      `UPDATE "transactions" SET "type" = 'INCOME' WHERE "type" NOT IN ('INCOME', 'EXPENSE')`,
    );
    // Ensure category column only has valid TransactionCategory values
    await queryRunner.query(
      `UPDATE "transactions" SET "category" = 'OTHER' WHERE "category" IS NOT NULL AND "category" NOT IN ('RENT', 'SALE', 'DEPOSIT', 'MAINTENANCE', 'COMMISSION', 'OTHER')`,
    );

    // Drop the index on category before changing its type
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_TRANSACTIONS_CATEGORY"`);

    // Convert type column to text so we can drop and recreate the enum
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "type" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "type" TYPE text USING "type"::text`,
    );
    await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);

    // Create a clean transactions_type_enum with only INCOME and EXPENSE
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_type_enum" AS ENUM('INCOME', 'EXPENSE')`,
    );

    // Create the missing transactions_category_enum
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_category_enum" AS ENUM('RENT', 'SALE', 'DEPOSIT', 'MAINTENANCE', 'COMMISSION', 'OTHER')`,
    );

    // Cast type column back to the clean enum
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "type" TYPE "public"."transactions_type_enum" USING "type"::"public"."transactions_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "type" SET DEFAULT 'INCOME'`,
    );

    // Cast category column from varchar to the new enum (drop default first — PostgreSQL can't auto-cast varchar default to enum)
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "category" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "category" TYPE "public"."transactions_category_enum" USING CASE WHEN "category" IS NULL THEN NULL ELSE "category"::"public"."transactions_category_enum" END`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "category" SET DEFAULT 'OTHER'`,
    );

    // Recreate the index on category
    await queryRunner.query(
      `CREATE INDEX "IDX_TRANSACTIONS_CATEGORY" ON "transactions"("category")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index before type change
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_TRANSACTIONS_CATEGORY"`);

    // Revert category to varchar(20)
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "category" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "category" TYPE varchar(20) USING "category"::text`,
    );
    await queryRunner.query(`DROP TYPE "public"."transactions_category_enum"`);

    // Revert type to text so we can drop and recreate
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "type" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "type" TYPE text USING "type"::text`,
    );
    await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);

    // Restore the original messy transactions_type_enum (all values that existed before this migration)
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_type_enum" AS ENUM('rent', 'sale', 'deposit', 'maintenance', 'commission', 'other', 'RENT', 'SALE', 'DEPOSIT', 'MAINTENANCE', 'COMMISSION', 'OTHER', 'INCOME', 'EXPENSE')`,
    );

    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "type" TYPE "public"."transactions_type_enum" USING "type"::"public"."transactions_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "type" SET DEFAULT 'INCOME'`,
    );

    // Restore index
    await queryRunner.query(
      `CREATE INDEX "IDX_TRANSACTIONS_CATEGORY" ON "transactions"("category")`,
    );
  }
}
