import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentOriginalFileName1779700000030 implements MigrationInterface {
  name = 'AddDocumentOriginalFileName1779700000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "property_documents" ADD COLUMN "original_file_name" character varying(255)`,
    );
    // Older rows take the storage key's name, or the display name plus extension when the key lost most characters.
    await queryRunner.query(
      `WITH k AS (
         SELECT "id", "name",
                regexp_replace(regexp_replace("s3_key", '^.*/', ''), '^[0-9]+-', '') AS "part"
           FROM "property_documents"
          WHERE "original_file_name" IS NULL
       )
       UPDATE "property_documents" d
          SET "original_file_name" = CASE
            WHEN k."part" IS NULL OR k."part" = '' THEN left(k."name", 255)
            WHEN length(regexp_replace(k."part", '[^_]', '', 'g')) > length(regexp_replace(k."part", '[^A-Za-z0-9]', '', 'g'))
              THEN left(k."name", 255 - length(COALESCE(substring(k."part" from '(\\.[A-Za-z0-9]+)$'), '')))
                || COALESCE(substring(k."part" from '(\\.[A-Za-z0-9]+)$'), '')
            ELSE left(k."part", 255)
          END
         FROM k
        WHERE d."id" = k."id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_documents" ALTER COLUMN "original_file_name" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "property_documents" DROP COLUMN IF EXISTS "original_file_name"`,
    );
  }
}
