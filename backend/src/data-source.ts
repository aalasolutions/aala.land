import { DataSource } from 'typeorm';
import { join, resolve } from 'path';
import * as dotenv from 'dotenv';

const projectRoot = resolve(__dirname, '..');

const envPath = resolve(projectRoot, '.env');
dotenv.config({ path: envPath });

console.log(`[DataSource] DB_HOST: ${process.env.DB_HOST || 'localhost'}`);
console.log(`[DataSource] DB_PORT: ${process.env.DB_PORT || '5480'}`);
console.log(`[DataSource] DB_DATABASE: ${process.env.DB_DATABASE || 'aala_land'}`);
console.log(`[DataSource] NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);

const entityPaths = [
  join(__dirname, '/modules/**/entities/*.entity{.ts,.js}'),
  join(__dirname, '/shared/**/*.entity{.ts,.js}'),
];

const migrationPaths = [
  join(__dirname, '/database/migrations/*{.ts,.js}'),
];

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5480', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'aala_land',
  schema: 'public',

  entities: entityPaths,
  migrations: migrationPaths,
  synchronize: process.env.DB_SYNC === 'true',
  logging: process.env.NODE_ENV !== 'production',
});
