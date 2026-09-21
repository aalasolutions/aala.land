import { DataSource } from 'typeorm';
import { join, resolve } from 'path';
import { envInt, envString } from '../../src/shared/utils/env.util';

const src = resolve(__dirname, '../../src');

// Never the dev database: the name is fixed here rather than read from the environment.
export const TEST_DATABASE = 'aala_land_test';

export function testDataSource(): DataSource {
  return new DataSource({
    type: 'postgres',
    host: envString('DB_HOST', 'localhost'),
    port: envInt('DB_PORT', 5480, 1),
    username: envString('DB_USERNAME', 'postgres'),
    password: envString('DB_PASSWORD', 'postgres'),
    database: TEST_DATABASE,
    schema: 'public',
    entities: [
      join(src, '/modules/**/entities/*.entity{.ts,.js}'),
      join(src, '/shared/**/*.entity{.ts,.js}'),
    ],
    migrations: [join(src, '/database/migrations/*{.ts,.js}')],
    synchronize: false,
    logging: false,
    extra: { options: '-c timezone=UTC' },
  });
}

/** Connects and brings the schema up to date. Migrations are idempotent, so a warm database is cheap. */
export async function connectTestDatabase(): Promise<DataSource> {
  const dataSource = testDataSource();
  await dataSource.initialize();
  await dataSource.runMigrations();
  return dataSource;
}
