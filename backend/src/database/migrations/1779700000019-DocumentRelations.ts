import { MigrationInterface, QueryRunner } from 'typeorm';

// SET NULL: a deleted parent leaves its documents in the company library.
const LINKS: Array<
  [column: string, target: string, foreignKey: string, index: string]
> = [
  [
    'contact_id',
    'contacts',
    'FK_property_documents_contact',
    'IDX_property_documents_contact',
  ],
  [
    'lease_id',
    'leases',
    'FK_property_documents_lease',
    'IDX_property_documents_lease',
  ],
  [
    'work_order_id',
    'work_orders',
    'FK_property_documents_work_order',
    'IDX_property_documents_work_order',
  ],
];

const SINGLE_LINK_CHECK = 'CHK_property_documents_single_link';

export class DocumentRelations1779700000019 implements MigrationInterface {
  name = 'DocumentRelations1779700000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [column, target, foreignKey, index] of LINKS) {
      await queryRunner.query(
        `ALTER TABLE "property_documents" ADD COLUMN IF NOT EXISTS "${column}" uuid NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "property_documents" DROP CONSTRAINT IF EXISTS "${foreignKey}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "property_documents" ADD CONSTRAINT "${foreignKey}" FOREIGN KEY ("${column}") REFERENCES "${target}"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${index}" ON "property_documents" ("${column}")`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "property_documents" DROP CONSTRAINT IF EXISTS "${SINGLE_LINK_CHECK}"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_documents" ADD CONSTRAINT "${SINGLE_LINK_CHECK}" CHECK (num_nonnulls("unit_id", "asset_id", "contact_id", "lease_id", "work_order_id") <= 1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "property_documents" DROP CONSTRAINT IF EXISTS "${SINGLE_LINK_CHECK}"`,
    );
    for (const [column, , foreignKey, index] of [...LINKS].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${index}"`);
      await queryRunner.query(
        `ALTER TABLE "property_documents" DROP CONSTRAINT IF EXISTS "${foreignKey}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "property_documents" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
  }
}
