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

// NO ACTION: the app already blocks deleting a unit or lease that still has linked rows.
const FOREIGN_KEYS: Array<
  [name: string, table: string, column: string, target: string]
> = [
  ['FK_leases_unit', 'leases', 'unit_id', 'units'],
  ['FK_cheques_unit', 'cheques', 'unit_id', 'units'],
  ['FK_cheques_lease', 'cheques', 'lease_id', 'leases'],
  ['FK_transactions_unit', 'transactions', 'unit_id', 'units'],
  ['FK_work_orders_unit', 'work_orders', 'unit_id', 'units'],
];

export class AddMissingForeignKeyIndexes1779700000007 implements MigrationInterface {
  name = 'AddMissingForeignKeyIndexes1779700000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, definition] of INDEXES) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${name}" ON ${definition}`,
      );
    }
    for (const [name, table, column, target] of FOREIGN_KEYS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}") REFERENCES "${target}"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name, table] of [...FOREIGN_KEYS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`,
      );
    }
    for (const [name] of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}
