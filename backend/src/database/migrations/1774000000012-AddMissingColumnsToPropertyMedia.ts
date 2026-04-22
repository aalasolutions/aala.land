import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingColumnsToPropertyMedia1774000000012 implements MigrationInterface {
    name = 'AddMissingColumnsToPropertyMedia1774000000012';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add missing columns to property_media table
        await queryRunner.query(`ALTER TABLE "property_media" ADD COLUMN "thumbnail_url" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "property_media" ADD COLUMN "file_name" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "property_media" ADD COLUMN "s3_key" varchar(500)`);
        await queryRunner.query(`ALTER TABLE "property_media" ADD COLUMN "content_type" varchar(100)`);
        await queryRunner.query(`ALTER TABLE "property_media" ADD COLUMN "file_size" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the added columns
        await queryRunner.query(`ALTER TABLE "property_media" DROP COLUMN "file_size"`);
        await queryRunner.query(`ALTER TABLE "property_media" DROP COLUMN "content_type"`);
        await queryRunner.query(`ALTER TABLE "property_media" DROP COLUMN "s3_key"`);
        await queryRunner.query(`ALTER TABLE "property_media" DROP COLUMN "file_name"`);
        await queryRunner.query(`ALTER TABLE "property_media" DROP COLUMN "thumbnail_url"`);
    }
}
