import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnerIdToUnitsTable1774000000005 implements MigrationInterface {
    name = 'AddOwnerIdToUnitsTable1774000000005';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add owner_id column to units table
        await queryRunner.query(`ALTER TABLE "units" ADD COLUMN "owner_id" uuid`);

        // Add missing columns that Unit entity expects
        await queryRunner.query(`ALTER TABLE "units" ADD COLUMN "description" text`);
        await queryRunner.query(`ALTER TABLE "units" ADD COLUMN "floor" varchar(20)`);
        await queryRunner.query(`ALTER TABLE "units" ADD COLUMN "photos" jsonb DEFAULT '[]'`);

        // Add foreign key constraint
        await queryRunner.query(`ALTER TABLE "units" ADD CONSTRAINT "fk_units_owner" FOREIGN KEY ("owner_id") REFERENCES "owners"("id")`);

        // Create index for better query performance
        await queryRunner.query(`CREATE INDEX "IDX_UNITS_OWNER_ID" ON "units"("owner_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the index and foreign key
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_UNITS_OWNER_ID"`);
        await queryRunner.query(`ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "fk_units_owner"`);

        // Drop the columns
        await queryRunner.query(`ALTER TABLE "units" DROP COLUMN IF EXISTS "photos"`);
        await queryRunner.query(`ALTER TABLE "units" DROP COLUMN IF EXISTS "floor"`);
        await queryRunner.query(`ALTER TABLE "units" DROP COLUMN IF EXISTS "description"`);
        await queryRunner.query(`ALTER TABLE "units" DROP COLUMN IF EXISTS "owner_id"`);
    }
}
