import { MigrationInterface, QueryRunner } from 'typeorm';

// Lookups are schema-scoped, and a database carrying neither name is an error:
// a silent success would leave the entity mapped to a column that is not there.
export class RenameEjariToTenancyRegistration1779700000010 implements MigrationInterface {
  name = 'RenameEjariToTenancyRegistration1779700000010';

  // The DDL is qualified with this schema, so guard and statement cannot diverge.
  private async schema(queryRunner: QueryRunner): Promise<string> {
    const [{ name }]: { name: string }[] = await queryRunner.query(
      `SELECT current_schema() AS name`,
    );
    return name.replace(/"/g, '""');
  }

  private async leaseColumns(queryRunner: QueryRunner): Promise<Set<string>> {
    const rows: { name: string }[] = await queryRunner.query(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'leases'
         AND column_name IN ('ejari_number', 'tenancy_registration_ref')`,
    );
    return new Set(rows.map((row) => row.name));
  }

  private async categoryLabels(queryRunner: QueryRunner): Promise<Set<string>> {
    const rows: { label: string }[] = await queryRunner.query(
      `SELECT e.enumlabel AS label FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = current_schema()
         AND t.typname = 'property_documents_category_enum'
         AND e.enumlabel IN ('EJARI', 'TENANCY_REGISTRATION')`,
    );
    return new Set(rows.map((row) => row.label));
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = await this.schema(queryRunner);
    const columns = await this.leaseColumns(queryRunner);
    if (columns.has('ejari_number')) {
      await queryRunner.query(
        `ALTER TABLE "${schema}"."leases" RENAME COLUMN "ejari_number" TO "tenancy_registration_ref"`,
      );
    } else if (!columns.has('tenancy_registration_ref')) {
      throw new Error(
        'leases has neither ejari_number nor tenancy_registration_ref',
      );
    }

    const labels = await this.categoryLabels(queryRunner);
    if (labels.has('EJARI')) {
      await queryRunner.query(
        `ALTER TYPE "${schema}"."property_documents_category_enum" RENAME VALUE 'EJARI' TO 'TENANCY_REGISTRATION'`,
      );
    } else if (!labels.has('TENANCY_REGISTRATION')) {
      throw new Error(
        'property_documents_category_enum has neither EJARI nor TENANCY_REGISTRATION',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = await this.schema(queryRunner);
    const labels = await this.categoryLabels(queryRunner);
    if (labels.has('TENANCY_REGISTRATION')) {
      await queryRunner.query(
        `ALTER TYPE "${schema}"."property_documents_category_enum" RENAME VALUE 'TENANCY_REGISTRATION' TO 'EJARI'`,
      );
    } else if (!labels.has('EJARI')) {
      throw new Error(
        'property_documents_category_enum has neither TENANCY_REGISTRATION nor EJARI',
      );
    }

    const columns = await this.leaseColumns(queryRunner);
    if (columns.has('tenancy_registration_ref')) {
      await queryRunner.query(
        `ALTER TABLE "${schema}"."leases" RENAME COLUMN "tenancy_registration_ref" TO "ejari_number"`,
      );
    } else if (!columns.has('ejari_number')) {
      throw new Error(
        'leases has neither tenancy_registration_ref nor ejari_number',
      );
    }
  }
}
