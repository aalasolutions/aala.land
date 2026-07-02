import { AppDataSource } from '../data-source';

async function dropSchema(): Promise<void> {
  await AppDataSource.initialize();
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    // Drop all user tables in public schema (CASCADE handles FK dependencies).
    // pg_tables only lists real tables, so extension-owned views are never touched.
    await queryRunner.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
        ) LOOP
          EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$
    `);

    // Drop all user-defined enum types that are NOT owned by an extension.
    await queryRunner.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT t.typname
          FROM pg_type t
          JOIN pg_namespace n ON t.typnamespace = n.oid
          LEFT JOIN pg_depend d ON d.objid = t.oid AND d.deptype = 'e'
          WHERE n.nspname = 'public'
            AND t.typtype = 'e'
            AND d.objid IS NULL
        ) LOOP
          EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
      END $$
    `);

    console.log('Schema dropped successfully.');
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

dropSchema().catch((err) => {
  console.error('Error during schema drop:', err);
  process.exit(1);
});
