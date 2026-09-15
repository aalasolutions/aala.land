import { MigrationInterface, QueryRunner } from 'typeorm';

// Unique only among CONNECTED/FLAGGED rows, matching the partial-unique pattern used elsewhere.
export class ScopeWhatsappPhoneNumberUniqueToLiveRows1779600000011
  implements MigrationInterface
{
  name = 'ScopeWhatsappPhoneNumberUniqueToLiveRows1779600000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_wa_connections_phone_number_id"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_wa_connections_phone_number_id" ON "whatsapp_connections" ("phone_number_id") WHERE "status" IN ('connected', 'flagged')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_wa_connections_phone_number_id"`,
    );
    // If duplicates exist, rebuilding fails on purpose: it names the rows a human must resolve.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_wa_connections_phone_number_id" ON "whatsapp_connections" ("phone_number_id")`,
    );
  }
}
