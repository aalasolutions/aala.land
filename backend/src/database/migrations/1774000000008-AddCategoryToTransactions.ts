import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryToTransactions1774000000008 implements MigrationInterface {
  name = 'AddCategoryToTransactions1774000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "transactions"
            ADD COLUMN "category" varchar(20) DEFAULT 'OTHER'
        `);

    await queryRunner.query(
      `CREATE INDEX "IDX_TRANSACTIONS_CATEGORY" ON "transactions"("category")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_TRANSACTIONS_CATEGORY"`);
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "category"`,
    );
  }
}
