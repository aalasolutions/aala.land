import { MigrationInterface, QueryRunner } from 'typeorm';

// NO ACTION: a hard delete is refused until the number is disconnected and its WABA unsubscribed through the app.
export class AddWhatsappConnectionForeignKeys1779600000013 implements MigrationInterface {
  name = 'AddWhatsappConnectionForeignKeys1779600000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_connections"
        ADD CONSTRAINT "FK_wa_connections_company"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_wa_connections_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_connections"
        DROP CONSTRAINT "FK_wa_connections_user",
        DROP CONSTRAINT "FK_wa_connections_company"
    `);
  }
}
