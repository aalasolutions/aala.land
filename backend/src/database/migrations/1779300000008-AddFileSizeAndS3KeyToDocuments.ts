import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFileSizeAndS3KeyToDocuments1779300000008 implements MigrationInterface {
  name = 'AddFileSizeAndS3KeyToDocuments1779300000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols: Array<{ column_name: string }> = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'property_documents'
        AND column_name IN ('file_size', 's3_key')
    `);
    const existing = cols.map((r) => r.column_name);

    if (!existing.includes('file_size')) {
      await queryRunner.query(`
        ALTER TABLE "property_documents"
          ADD COLUMN "file_size" integer NULL
      `);
    }
    if (!existing.includes('s3_key')) {
      await queryRunner.query(`
        ALTER TABLE "property_documents"
          ADD COLUMN "s3_key" varchar(500) NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "property_documents"
        DROP COLUMN IF EXISTS "file_size",
        DROP COLUMN IF EXISTS "s3_key"
    `);
  }
}
