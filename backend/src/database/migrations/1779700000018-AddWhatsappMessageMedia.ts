import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappMessageMedia1779700000018 implements MigrationInterface {
  name = 'AddWhatsappMessageMedia1779700000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages"
         ADD COLUMN IF NOT EXISTS "media_meta_id" varchar,
         ADD COLUMN IF NOT EXISTS "media_mime" varchar,
         ADD COLUMN IF NOT EXISTS "media_file_name" varchar,
         ADD COLUMN IF NOT EXISTS "media_size_bytes" bigint,
         ADD COLUMN IF NOT EXISTS "media_sha256" varchar,
         ADD COLUMN IF NOT EXISTS "media_key" varchar,
         ADD COLUMN IF NOT EXISTS "media_status" varchar(16),
         ADD COLUMN IF NOT EXISTS "media_stored_at" timestamptz,
         ADD COLUMN IF NOT EXISTS "media_deleted_at" timestamptz,
         ADD COLUMN IF NOT EXISTS "media_deleted_by" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages" DROP COLUMN IF EXISTS "media_urls"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "media_urls" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_messages"
         DROP COLUMN IF EXISTS "media_deleted_by",
         DROP COLUMN IF EXISTS "media_deleted_at",
         DROP COLUMN IF EXISTS "media_stored_at",
         DROP COLUMN IF EXISTS "media_status",
         DROP COLUMN IF EXISTS "media_key",
         DROP COLUMN IF EXISTS "media_sha256",
         DROP COLUMN IF EXISTS "media_size_bytes",
         DROP COLUMN IF EXISTS "media_file_name",
         DROP COLUMN IF EXISTS "media_mime",
         DROP COLUMN IF EXISTS "media_meta_id"`,
    );
  }
}
