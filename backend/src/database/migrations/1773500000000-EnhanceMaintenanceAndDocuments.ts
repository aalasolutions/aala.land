import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceMaintenanceAndDocuments1773500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // === Work Orders: photos, costNotes, preventive maintenance ===

        const woColumns = await queryRunner.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'work_orders'`,
        );
        const woColumnNames = woColumns.map((c: any) => c.column_name);

        if (!woColumnNames.includes('photos')) {
            await queryRunner.query(
                `ALTER TABLE "work_orders" ADD "photos" jsonb NOT NULL DEFAULT '[]'`,
            );
        }

        if (!woColumnNames.includes('cost_notes')) {
            await queryRunner.query(
                `ALTER TABLE "work_orders" ADD "cost_notes" text`,
            );
        }

        if (!woColumnNames.includes('is_preventive')) {
            await queryRunner.query(
                `ALTER TABLE "work_orders" ADD "is_preventive" boolean NOT NULL DEFAULT false`,
            );
        }

        // Create schedule_frequency enum if not exists
        const hasEnum = await queryRunner.query(
            `SELECT 1 FROM pg_type WHERE typname = 'work_orders_schedule_frequency_enum'`,
        );
        if (!hasEnum.length) {
            await queryRunner.query(
                `CREATE TYPE "work_orders_schedule_frequency_enum" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY')`,
            );
        }

        if (!woColumnNames.includes('schedule_frequency')) {
            await queryRunner.query(
                `ALTER TABLE "work_orders" ADD "schedule_frequency" "work_orders_schedule_frequency_enum"`,
            );
        }

        if (!woColumnNames.includes('next_scheduled_date')) {
            await queryRunner.query(
                `ALTER TABLE "work_orders" ADD "next_scheduled_date" TIMESTAMP`,
            );
        }

        // === Property Documents: category, access_level, version, previous_version_id, uploaded_by ===

        const pdColumns = await queryRunner.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'property_documents'`,
        );
        const pdColumnNames = pdColumns.map((c: any) => c.column_name);

        // Create category enum if not exists
        const hasCategoryEnum = await queryRunner.query(
            `SELECT 1 FROM pg_type WHERE typname = 'property_documents_category_enum'`,
        );
        if (!hasCategoryEnum.length) {
            await queryRunner.query(
                `CREATE TYPE "property_documents_category_enum" AS ENUM ('LEASE', 'EJARI', 'TITLE_DEED', 'ID_COPY', 'NOC', 'INSURANCE', 'MAINTENANCE', 'INVOICE', 'RECEIPT', 'OTHER')`,
            );
        }

        if (!pdColumnNames.includes('category')) {
            await queryRunner.query(
                `ALTER TABLE "property_documents" ADD "category" "property_documents_category_enum" NOT NULL DEFAULT 'OTHER'`,
            );
        }

        // Create access_level enum if not exists
        const hasAccessEnum = await queryRunner.query(
            `SELECT 1 FROM pg_type WHERE typname = 'property_documents_access_level_enum'`,
        );
        if (!hasAccessEnum.length) {
            await queryRunner.query(
                `CREATE TYPE "property_documents_access_level_enum" AS ENUM ('PUBLIC', 'COMPANY', 'OWNER_ONLY', 'ADMIN_ONLY')`,
            );
        }

        if (!pdColumnNames.includes('access_level')) {
            await queryRunner.query(
                `ALTER TABLE "property_documents" ADD "access_level" "property_documents_access_level_enum" NOT NULL DEFAULT 'COMPANY'`,
            );
        }

        if (!pdColumnNames.includes('version')) {
            await queryRunner.query(
                `ALTER TABLE "property_documents" ADD "version" int NOT NULL DEFAULT 1`,
            );
        }

        if (!pdColumnNames.includes('previous_version_id')) {
            await queryRunner.query(
                `ALTER TABLE "property_documents" ADD "previous_version_id" uuid`,
            );
            await queryRunner.query(
                `ALTER TABLE "property_documents" ADD CONSTRAINT "FK_property_documents_previous_version" FOREIGN KEY ("previous_version_id") REFERENCES "property_documents"("id") ON DELETE SET NULL`,
            );
        }

        if (!pdColumnNames.includes('uploaded_by')) {
            await queryRunner.query(
                `ALTER TABLE "property_documents" ADD "uploaded_by" uuid`,
            );
        }

        // Rename fileType column to file_type if needed (fix snake_case convention)
        if (pdColumnNames.includes('filetype') && !pdColumnNames.includes('file_type')) {
            await queryRunner.query(
                `ALTER TABLE "property_documents" RENAME COLUMN "filetype" TO "file_type"`,
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Property Documents columns
        await queryRunner.query(`ALTER TABLE "property_documents" DROP CONSTRAINT IF EXISTS "FK_property_documents_previous_version"`);
        await queryRunner.query(`ALTER TABLE "property_documents" DROP COLUMN IF EXISTS "uploaded_by"`);
        await queryRunner.query(`ALTER TABLE "property_documents" DROP COLUMN IF EXISTS "previous_version_id"`);
        await queryRunner.query(`ALTER TABLE "property_documents" DROP COLUMN IF EXISTS "version"`);
        await queryRunner.query(`ALTER TABLE "property_documents" DROP COLUMN IF EXISTS "access_level"`);
        await queryRunner.query(`ALTER TABLE "property_documents" DROP COLUMN IF EXISTS "category"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "property_documents_access_level_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "property_documents_category_enum"`);

        // Work Orders columns
        await queryRunner.query(`ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "next_scheduled_date"`);
        await queryRunner.query(`ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "schedule_frequency"`);
        await queryRunner.query(`ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "is_preventive"`);
        await queryRunner.query(`ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "cost_notes"`);
        await queryRunner.query(`ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "photos"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "work_orders_schedule_frequency_enum"`);
    }
}
