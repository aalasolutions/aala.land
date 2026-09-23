import { DataSource, EntityManager } from 'typeorm';
import { connectTestDatabase } from './test-data-source';
import { seedCompany, seedUnit, seeded } from './harness';
import { MoneyCurrencyAndLeaseRegion1779700000014 } from '../../src/database/migrations/1779700000014-MoneyCurrencyAndLeaseRegion';

// Asserts what 1779700000014 leaves on the schema: the currency defaults, the
// lease region column, its index, and the NOT NULL that the column has no
// default to satisfy.
describe('money currency and lease region, against a real database', () => {
  let dataSource: DataSource;

  const MAKKAH = 'makkah';

  const CURRENCY_TABLES = [
    'cheques',
    'transactions',
    'commissions',
    'vendors',
    'leases',
    'work_orders',
  ];

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  const company = (manager: EntityManager) =>
    seedCompany(manager, 'Currency Co', [MAKKAH]);

  // Runs the migration's own up() over an undone schema, so an edit to it changes
  // the outcome here. The cases below assert the live schema, which a warm
  // database already satisfies before up() is ever reached.
  it('up() is what puts the defaults and the lease column there', async () => {
    await seeded(dataSource, async (manager) => {
      const runner = manager.queryRunner!;
      await runner.query(`DROP INDEX IF EXISTS "IDX_LEASES_REGION_CODE"`);
      await runner.query(
        `ALTER TABLE "leases" DROP COLUMN IF EXISTS "region_code"`,
      );
      for (const table of CURRENCY_TABLES) {
        await runner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "currency" SET DEFAULT 'AED'`,
        );
      }

      await new MoneyCurrencyAndLeaseRegion1779700000014().up(runner);

      const defaults: { table_name: string; column_default: string }[] =
        await runner.query(
          `SELECT table_name, column_default FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'currency' AND table_name = ANY($1)`,
          [CURRENCY_TABLES],
        );
      expect(defaults).toHaveLength(CURRENCY_TABLES.length);
      for (const row of defaults) {
        expect(row.column_default).toContain("'USD'");
      }

      const column: { is_nullable: string }[] = await runner.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'leases' AND column_name = 'region_code'`,
      );
      expect(column[0].is_nullable).toBe('NO');

      const index: { indexname: string }[] = await runner.query(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'leases' AND indexname = 'IDX_LEASES_REGION_CODE'`,
      );
      expect(index).toHaveLength(1);
    });
  });

  it('up() is replayable over its own effects', async () => {
    await seeded(dataSource, async (manager) => {
      const runner = manager.queryRunner!;
      await expect(
        new MoneyCurrencyAndLeaseRegion1779700000014().up(runner),
      ).resolves.not.toThrow();
    });
  });

  it('defaults currency to USD on every money table', async () => {
    const rows: { table_name: string; column_default: string | null }[] =
      await dataSource.query(
        `SELECT table_name, column_default FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name = 'currency' AND table_name = ANY($1)`,
        [CURRENCY_TABLES],
      );

    expect(rows).toHaveLength(CURRENCY_TABLES.length);
    for (const row of rows) {
      expect(row.column_default).toContain("'USD'");
    }
  });

  it('applies that default to an insert that omits currency', async () => {
    await seeded(dataSource, async (manager) => {
      const co = await company(manager);
      const inserted: { id: string }[] = await manager.query(
        `INSERT INTO "transactions"
           ("company_id", "region_code", "type", "category", "status", "amount", "description", "transaction_date")
         VALUES ($1, $2, 'INCOME', 'RENT', 'COMPLETED', 1000, 'fixture', '2026-09-01')
         RETURNING id`,
        [co.id, MAKKAH],
      );
      const rows: { currency: string }[] = await manager.query(
        `SELECT currency FROM "transactions" WHERE id = $1`,
        [inserted[0].id],
      );

      expect(rows[0].currency).toBe('USD');
    });
  });

  it('gives leases a NOT NULL region_code with an index', async () => {
    const column: { is_nullable: string }[] = await dataSource.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'leases' AND column_name = 'region_code'`,
    );
    expect(column[0].is_nullable).toBe('NO');

    const index: { indexname: string }[] = await dataSource.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'leases' AND indexname = 'IDX_LEASES_REGION_CODE'`,
    );
    expect(index).toHaveLength(1);
  });

  it('refuses a lease with no region, so the column cannot drift empty', async () => {
    await seeded(dataSource, async (manager) => {
      const co = await company(manager);
      const unitId = await seedUnit(manager, co.id, MAKKAH);

      await expect(
        manager.query(
          `INSERT INTO "leases"
             ("company_id", "unit_id", "start_date", "end_date", "monthly_rent", "status", "type")
           VALUES ($1, $2, '2026-01-01', '2026-12-31', 5000, 'DRAFT', 'RESIDENTIAL')`,
          [co.id, unitId],
        ),
      ).rejects.toThrow(/region_code/);
    });
  });
});
