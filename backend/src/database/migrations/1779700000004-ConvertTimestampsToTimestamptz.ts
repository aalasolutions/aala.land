import { MigrationInterface, QueryRunner } from 'typeorm';

// Existing values were written as UTC wall-clock, so they are read back AT TIME ZONE 'UTC'.
const COLUMNS: Record<string, string[]> = {
  ai_credit_usage: ['created_at', 'updated_at'],
  assets: ['created_at', 'updated_at'],
  audit_logs: ['created_at'],
  billing_history: ['created_at'],
  billing_prices: ['created_at', 'updated_at'],
  cheques: ['created_at', 'last_bounce_date', 'updated_at'],
  cities: ['created_at'],
  commissions: ['created_at', 'paid_at', 'updated_at'],
  companies: ['created_at', 'updated_at'],
  contacts: ['created_at', 'updated_at'],
  custom_deals: ['created_at', 'updated_at'],
  email_templates: ['created_at', 'updated_at'],
  lead_activities: ['created_at'],
  leads: ['created_at', 'updated_at'],
  leases: ['created_at', 'updated_at'],
  localities: ['created_at'],
  lock_lifts: ['created_at'],
  manual_payments: ['created_at'],
  notifications: ['created_at', 'updated_at'],
  payment_remedies: ['created_at'],
  property_documents: ['created_at', 'updated_at'],
  property_media: ['created_at', 'updated_at'],
  reminder_rules: ['created_at', 'updated_at'],
  stripe_events: ['processed_at', 'received_at'],
  transactions: ['created_at', 'paid_at', 'updated_at'],
  units: ['created_at', 'updated_at'],
  users: [
    'created_at',
    'last_login_at',
    'reset_password_expires',
    'updated_at',
  ],
  vendors: ['created_at', 'updated_at'],
  whatsapp_ai_conversations: ['created_at'],
  whatsapp_chats: ['created_at', 'updated_at'],
  whatsapp_connections: ['created_at', 'updated_at'],
  whatsapp_messages: ['created_at'],
  whatsapp_settings: ['created_at', 'updated_at'],
  work_orders: [
    'completed_at',
    'created_at',
    'next_scheduled_date',
    'scheduled_date',
    'updated_at',
  ],
};

const DEDUP_INDEX = 'UQ_notifications_reminder_dedup_daily';
const DEDUP_COLUMNS = `"company_id", "user_id", "type", "entity_id"`;
const DEDUP_WHERE =
  `WHERE "entity_id" IS NOT NULL ` +
  `AND "type" IN ('CHEQUE_DUE', 'CHEQUE_OVERDUE', 'CHEQUE_DELAYED', 'LEAD_UNASSIGNED')`;

export class ConvertTimestampsToTimestamptz1779700000004 implements MigrationInterface {
  name = 'ConvertTimestampsToTimestamptz1779700000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // (created_at)::date is not IMMUTABLE on timestamptz; rebuild on explicit UTC day
    await queryRunner.query(`DROP INDEX IF EXISTS "${DEDUP_INDEX}"`);
    await this.convert(
      queryRunner,
      'timestamp without time zone',
      'timestamptz',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${DEDUP_INDEX}" ON "notifications" ` +
        `(${DEDUP_COLUMNS}, (("created_at" AT TIME ZONE 'UTC')::date)) ${DEDUP_WHERE}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "${DEDUP_INDEX}"`);
    await this.convert(queryRunner, 'timestamp with time zone', 'timestamp');
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${DEDUP_INDEX}" ON "notifications" ` +
        `(${DEDUP_COLUMNS}, (("created_at")::date)) ${DEDUP_WHERE}`,
    );
  }

  // Alters only listed columns currently of fromType, so tables absent on this branch are skipped.
  private async convert(
    queryRunner: QueryRunner,
    fromType: string,
    toType: string,
  ): Promise<void> {
    const rows: { table_name: string; column_name: string }[] =
      await queryRunner.query(
        `SELECT table_name, column_name FROM information_schema.columns ` +
          `WHERE table_schema = current_schema() AND data_type = $1 AND table_name = ANY($2)`,
        [fromType, Object.keys(COLUMNS)],
      );
    const present = new Set(
      rows.map((r) => `${r.table_name}.${r.column_name}`),
    );

    for (const [table, columns] of Object.entries(COLUMNS)) {
      const clauses = columns
        .filter((column) => present.has(`${table}.${column}`))
        .map(
          (column) =>
            `ALTER COLUMN "${column}" TYPE ${toType} USING "${column}" AT TIME ZONE 'UTC'`,
        );
      if (clauses.length === 0) continue;
      await queryRunner.query(`ALTER TABLE "${table}" ${clauses.join(', ')}`);
    }
  }
}
