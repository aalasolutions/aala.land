import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddThumbnailSizeToPropertyMedia1779083947009 implements MigrationInterface {
  name = 'AddThumbnailSizeToPropertyMedia1779083947009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const colExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'property_media'
        AND column_name = 'thumbnail_size'
    `);
    if (colExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "property_media"
          ADD COLUMN "thumbnail_size" integer NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "property_media"
        DROP COLUMN IF EXISTS "thumbnail_size"
    `);
  }
}
