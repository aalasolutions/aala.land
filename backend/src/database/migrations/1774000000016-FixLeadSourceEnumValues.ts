import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixLeadSourceEnumValues1774000000016 implements MigrationInterface {
    name = 'FixLeadSourceEnumValues1774000000016';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add new uppercase values to the enum
        await queryRunner.query(`ALTER TYPE "leads_source_enum" ADD VALUE 'WEBSITE' BEFORE 'website'`);
        await queryRunner.query(`ALTER TYPE "leads_source_enum" ADD VALUE 'WHATSAPP' BEFORE 'whatsapp'`);
        await queryRunner.query(`ALTER TYPE "leads_source_enum" ADD VALUE 'REFERRAL' BEFORE 'referral'`);
        await queryRunner.query(`ALTER TYPE "leads_source_enum" ADD VALUE 'SOCIAL_MEDIA' BEFORE 'social_media'`);
        await queryRunner.query(`ALTER TYPE "leads_source_enum" ADD VALUE 'WALK_IN' BEFORE 'walk_in'`);
        await queryRunner.query(`ALTER TYPE "leads_source_enum" ADD VALUE 'OTHER' BEFORE 'other'`);

        // Update existing data to use uppercase values using text conversion workaround
        await queryRunner.query(`UPDATE "leads" SET "source" = upper("source"::text)::leads_source_enum`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert data changes
        await queryRunner.query(`UPDATE "leads" SET "source" = 'website' WHERE "source" = 'WEBSITE'`);
        await queryRunner.query(`UPDATE "leads" SET "source" = 'whatsapp' WHERE "source" = 'WHATSAPP'`);
        await queryRunner.query(`UPDATE "leads" SET "source" = 'referral' WHERE "source" = 'REFERRAL'`);
        await queryRunner.query(`UPDATE "leads" SET "source" = 'social_media' WHERE "source" = 'SOCIAL_MEDIA'`);
        await queryRunner.query(`UPDATE "leads" SET "source" = 'walk_in' WHERE "source" = 'WALK_IN'`);
        await queryRunner.query(`UPDATE "leads" SET "source" = 'other' WHERE "source" = 'OTHER'`);

        // Note: PostgreSQL doesn't support removing enum values easily, so we leave them
    }
}
