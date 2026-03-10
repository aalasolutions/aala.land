import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVendorIdToWorkOrders1773138380000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'vendor_id'`,
        );
        if (hasColumn.length) {
            return;
        }

        await queryRunner.query(`ALTER TABLE "work_orders" ADD "vendor_id" uuid`);
        await queryRunner.query(
            `ALTER TABLE "work_orders" ADD CONSTRAINT "FK_work_orders_vendor" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "work_orders" DROP CONSTRAINT IF EXISTS "FK_work_orders_vendor"`);
        await queryRunner.query(`ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "vendor_id"`);
    }
}
