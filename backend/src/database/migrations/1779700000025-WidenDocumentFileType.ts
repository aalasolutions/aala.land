import { MigrationInterface, QueryRunner } from 'typeorm';

export class WidenDocumentFileType1779700000025 implements MigrationInterface {
  name = 'WidenDocumentFileType1779700000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Office MIME types run to 73 characters, past the old 50.
    await queryRunner.query(
      `ALTER TABLE "property_documents" ALTER COLUMN "file_type" TYPE character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "property_documents" ALTER COLUMN "file_type" TYPE character varying(50) USING left("file_type", 50)`,
    );
  }
}
