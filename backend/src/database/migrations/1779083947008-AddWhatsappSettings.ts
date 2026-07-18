import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappSettings1779083947008 implements MigrationInterface {
  name = 'AddWhatsappSettings1779083947008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "whatsapp_settings" (
        "id"         uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid        NOT NULL,
        "ai_prompt"  text,
        "ai_enabled" boolean     DEFAULT NULL,
        "created_at" TIMESTAMP   NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_whatsapp_settings_company" UNIQUE ("company_id"),
        CONSTRAINT "PK_whatsapp_settings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "whatsapp_settings"
        ADD CONSTRAINT "FK_whatsapp_settings_company"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_settings" DROP CONSTRAINT "FK_whatsapp_settings_company"`,
    );
    await queryRunner.query(`DROP TABLE "whatsapp_settings"`);
  }
}
