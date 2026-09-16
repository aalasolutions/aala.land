import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPropertyDocumentsFileTypeColumn1774000000013 implements MigrationInterface {
  name = 'FixPropertyDocumentsFileTypeColumn1774000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Matches the entity's snake_case column name.
    await queryRunner.query(
      `ALTER TABLE "property_documents" RENAME COLUMN "fileType" TO "file_type"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "property_documents" RENAME COLUMN "file_type" TO "fileType"`,
    );
  }
}
