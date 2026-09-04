import { MigrationInterface, QueryRunner } from 'typeorm';

// The unique index on phone_number_id was global, so a DISCONNECTED row kept the number
// locked forever. When an agent leaves, seat removal disconnects their row, and their
// replacement could then never connect the same company number.
//
// The invariant that actually matters is narrower: the inbound webhook router resolves a
// delivery by phone_number_id against CONNECTED and FLAGGED rows only, so uniqueness is
// only required among those. Matches the partial-unique pattern already used by
// users (deleted_at IS NULL), custom_deals (ended_at IS NULL) and billing_prices.
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
    // Rebuilding the global index fails if duplicates were created while the partial one
    // was live. That is the correct outcome: it names the rows a human has to resolve.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_wa_connections_phone_number_id" ON "whatsapp_connections" ("phone_number_id")`,
    );
  }
}
