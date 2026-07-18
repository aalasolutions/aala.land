import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameMaxCountriesToMaxRegions1779500000048 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // FREE now caps to a single region (state/emirate) rather than a whole country,
    // so the limit column is renamed to match the unit it now counts. Values are
    // unchanged (FREE 1, paid 999); only the semantics and the column name move.
    const hasNew = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'max_regions'`,
    );
    if (hasNew.length) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "companies" RENAME COLUMN "max_countries" TO "max_regions"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasOld = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'max_countries'`,
    );
    if (hasOld.length) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "companies" RENAME COLUMN "max_regions" TO "max_countries"`,
    );
  }
}
