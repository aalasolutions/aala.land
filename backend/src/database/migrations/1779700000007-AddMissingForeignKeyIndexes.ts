import { MigrationInterface, QueryRunner } from 'typeorm';

const INDEXES: Array<[name: string, definition: string]> = [
  ['IDX_PROPERTY_MEDIA_COMPANY_ID', `"property_media" ("company_id")`],
  ['IDX_PROPERTY_MEDIA_UNIT_ID', `"property_media" ("unit_id")`],
  ['IDX_PROPERTY_MEDIA_ASSET_ID', `"property_media" ("asset_id")`],
  ['IDX_PROPERTY_DOCUMENTS_UNIT_ID', `"property_documents" ("unit_id")`],
  ['IDX_PROPERTY_DOCUMENTS_ASSET_ID', `"property_documents" ("asset_id")`],
  ['IDX_CHEQUES_COMPANY_ID', `"cheques" ("company_id")`],
  ['IDX_CHEQUES_LEASE_ID', `"cheques" ("lease_id")`],
  ['IDX_CHEQUES_UNIT_ID', `"cheques" ("unit_id")`],
  ['IDX_TRANSACTIONS_COMPANY_ID', `"transactions" ("company_id")`],
  ['IDX_TRANSACTIONS_UNIT_ID', `"transactions" ("unit_id")`],
  ['IDX_WORK_ORDERS_UNIT_ID', `"work_orders" ("unit_id")`],
  ['IDX_LEASES_UNIT_ID', `"leases" ("unit_id")`],
  ['IDX_UNITS_ASSET_ID', `"units" ("asset_id")`],
  [
    'IDX_units_company_agent_active_rows',
    `"units" ("company_id", "assigned_agent_id") WHERE "deleted_at" IS NULL`,
  ],
  ['IDX_LEADS_COMPANY_ID', `"leads" ("company_id")`],
  ['IDX_LEADS_ASSIGNED_TO', `"leads" ("assigned_to")`],
];

export class AddMissingForeignKeyIndexes1779700000007 implements MigrationInterface {
  name = 'AddMissingForeignKeyIndexes1779700000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, definition] of INDEXES) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${name}" ON ${definition}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name] of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}
