import './shared/utils/utc-runtime';
import { DataSource } from 'typeorm';
import { join, resolve } from 'path';
import * as dotenv from 'dotenv';
import { envString, envInt, envBool } from './shared/utils/env.util';

const projectRoot = resolve(__dirname, '..');

const envPath = resolve(projectRoot, '.env');
dotenv.config({ path: envPath });

const nodeEnv = envString('NODE_ENV');

if (nodeEnv !== 'production') {
  console.log(`[DataSource] DB_HOST: ${envString('DB_HOST', 'localhost')}`);
  console.log(`[DataSource] DB_PORT: ${envInt('DB_PORT', 5480, 1)}`);
  console.log(
    `[DataSource] DB_DATABASE: ${envString('DB_DATABASE', 'aala_land')}`,
  );
  console.log(`[DataSource] NODE_ENV: ${nodeEnv || 'not set'}`);
}

const entityPaths = [
  join(__dirname, '/modules/**/entities/*.entity{.ts,.js}'),
  join(__dirname, '/shared/**/*.entity{.ts,.js}'),
];

const migrationPaths = [join(__dirname, '/database/migrations/*{.ts,.js}')];

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: envString('DB_HOST', 'localhost'),
  port: envInt('DB_PORT', 5480, 1),
  username: envString('DB_USERNAME', 'postgres'),
  password: envString('DB_PASSWORD', 'postgres'),
  database: envString('DB_DATABASE', 'aala_land'),
  schema: 'public',

  entities: entityPaths,
  migrations: migrationPaths,
  synchronize: envBool('DB_SYNC', false),
  logging: nodeEnv !== 'production',
  extra: { options: '-c timezone=UTC' },
});
