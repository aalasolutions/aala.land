import './shared/utils/utc-runtime';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { envString, envInt } from './shared/utils/env.util';

const entityPaths = [
  join(__dirname, '/modules/**/entities/*.entity{.ts,.js}'),
  join(__dirname, '/shared/**/*.entity{.ts,.js}'),
];

export const TestDataSource = new DataSource({
  type: 'postgres',
  host: envString('DB_HOST', 'localhost'),
  port: envInt('DB_PORT', 5480, 1),
  username: envString('DB_USERNAME', 'postgres'),
  password: envString('DB_PASSWORD', 'postgres'),
  database: envString('DB_DATABASE', 'aala_land_test'),

  entities: entityPaths,
  migrations: [join(__dirname, '/database/migrations/*{.ts,.js}')],
  synchronize: false,
  logging: true,
  extra: { options: '-c timezone=UTC' },
});
