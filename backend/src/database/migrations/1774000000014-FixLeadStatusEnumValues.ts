import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLeadStatusEnumValues1774000000014 implements MigrationInterface {
    name = 'FixLeadStatusEnumValues1774000000014';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add new uppercase values to the enum
        await queryRunner.query(`ALTER TYPE "leads_status_enum" ADD VALUE 'NEW' BEFORE 'new'`);
        await queryRunner.query(`ALTER TYPE "leads_status_enum" ADD VALUE 'CONTACTED' BEFORE 'contacted'`);
        await queryRunner.query(`ALTER TYPE "leads_status_enum" ADD VALUE 'VIEWING' BEFORE 'viewing'`);
        await queryRunner.query(`ALTER TYPE "leads_status_enum" ADD VALUE 'NEGOTIATING' BEFORE 'negotiating'`);
        await queryRunner.query(`ALTER TYPE "leads_status_enum" ADD VALUE 'WON' BEFORE 'won'`);
        await queryRunner.query(`ALTER TYPE "leads_status_enum" ADD VALUE 'LOST' BEFORE 'lost'`);

        // Update existing data to use uppercase values using text conversion workaround
        await queryRunner.query(`UPDATE "leads" SET "status" = upper("status"::text)::leads_status_enum`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert data changes
        await queryRunner.query(`UPDATE "leads" SET "status" = 'new' WHERE "status" = 'NEW'`);
        await queryRunner.query(`UPDATE "leads" SET "status" = 'contacted' WHERE "status" = 'CONTACTED'`);
        await queryRunner.query(`UPDATE "leads" SET "status" = 'viewing' WHERE "status" = 'VIEWING'`);
        await queryRunner.query(`UPDATE "leads" SET "status" = 'negotiating' WHERE "status" = 'NEGOTIATING'`);
        await queryRunner.query(`UPDATE "leads" SET "status" = 'won' WHERE "status" = 'WON'`);
        await queryRunner.query(`UPDATE "leads" SET "status" = 'lost' WHERE "status" = 'LOST'`);

        // Note: PostgreSQL doesn't support removing enum values easily, so we leave them
    }
}
