import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPropertyDocumentsFileTypeColumn1774000000013 implements MigrationInterface {
    name = 'FixPropertyDocumentsFileTypeColumn1774000000013';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Rename fileType column to file_type to match entity expectation
        await queryRunner.query(`ALTER TABLE "property_documents" RENAME COLUMN "fileType" TO "file_type"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert the change
        await queryRunner.query(`ALTER TABLE "property_documents" RENAME COLUMN "file_type" TO "fileType"`);
    }
}
