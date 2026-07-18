import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserRemovalSchema1779500000041 implements MigrationInterface {
  name = 'UserRemovalSchema1779500000041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. contacts.created_by ownership column (contract section 12).
    //    Existing rows stay NULL and are skipped by reassignment.
    await queryRunner.query(`
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "created_by" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contacts_created_by" ON "contacts" ("created_by")
    `);
    // Composite matching the reassignment WHERE (created_by = :from AND company_id = :co),
    // consistent with the other reassignment-target indexes added below.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contacts_company_created_by" ON "contacts" ("company_id", "created_by")`,
    );

    // 2 and 3. Repoint history FKs to ON DELETE SET NULL so hard delete is
    //    physically possible while history rows stay unreassigned.
    //    Constraint names on existing databases are TypeORM-generated hashes,
    //    so discover and drop them dynamically, then add a named replacement.
    await this.repointUserFk(
      queryRunner,
      'lead_activities',
      'performed_by',
      'FK_lead_activities_performed_by_users',
    );
    await this.repointUserFk(
      queryRunner,
      'audit_logs',
      'user_id',
      'FK_audit_logs_user_id_users',
    );

    // 4. Composite indexes matching the reassignment WHERE clause
    //    (<owner_col> = :fromUserId AND company_id = :companyId) and the
    //    delete-block commission count. These three tables index neither the
    //    owner column nor company_id, so without this the reassignment UPDATEs
    //    degrade to a full-table scan on every user removal, deactivation, and
    //    trim. leads.assigned_to and owners.assigned_agent_id already have a
    //    company_id index (tenant-bounded), so they are left as is.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_commissions_company_agent" ON "commissions" ("company_id", "agent_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_work_orders_company_assigned" ON "work_orders" ("company_id", "assigned_to")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_property_documents_company_uploaded" ON "property_documents" ("company_id", "uploaded_by")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the reassignment composite indexes.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_property_documents_company_uploaded"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_work_orders_company_assigned"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_commissions_company_agent"`,
    );

    // Restore plain NO ACTION FKs.
    await queryRunner.query(
      `ALTER TABLE "lead_activities" DROP CONSTRAINT IF EXISTS "FK_lead_activities_performed_by_users"`,
    );
    await queryRunner.query(`
      ALTER TABLE "lead_activities"
        ADD CONSTRAINT "FK_lead_activities_performed_by_users"
        FOREIGN KEY ("performed_by") REFERENCES "users"("id")
    `);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "FK_audit_logs_user_id_users"`,
    );
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
        ADD CONSTRAINT "FK_audit_logs_user_id_users"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contacts_company_created_by"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contacts_created_by"`);
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN IF EXISTS "created_by"`,
    );
  }

  private async repointUserFk(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    newName: string,
  ): Promise<void> {
    const existing: Array<{ conname: string }> = await queryRunner.query(
      `
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
      WHERE rel.relname = $1 AND con.contype = 'f' AND att.attname = $2
      `,
      [table, column],
    );
    for (const row of existing) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${row.conname}"`,
      );
    }
    await queryRunner.query(`
      ALTER TABLE "${table}"
        ADD CONSTRAINT "${newName}"
        FOREIGN KEY ("${column}") REFERENCES "users"("id") ON DELETE SET NULL
    `);
  }
}
