import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnerIdToUnitsTable1774000000005 implements MigrationInterface {
  name = 'AddOwnerIdToUnitsTable1774000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "units" ADD COLUMN "owner_id" uuid`);

    await queryRunner.query(
      `ALTER TABLE "units" ADD COLUMN "description" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ADD COLUMN "floor" varchar(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" ADD COLUMN "photos" jsonb DEFAULT '[]'`,
    );

    await queryRunner.query(
      `ALTER TABLE "units" ADD CONSTRAINT "fk_units_owner" FOREIGN KEY ("owner_id") REFERENCES "owners"("id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_UNITS_OWNER_ID" ON "units"("owner_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_UNITS_OWNER_ID"`);
    await queryRunner.query(
      `ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "fk_units_owner"`,
    );

    await queryRunner.query(
      `ALTER TABLE "units" DROP COLUMN IF EXISTS "photos"`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" DROP COLUMN IF EXISTS "floor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" DROP COLUMN IF EXISTS "description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "units" DROP COLUMN IF EXISTS "owner_id"`,
    );
  }
}
