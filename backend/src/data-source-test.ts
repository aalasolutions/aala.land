import { DataSource } from 'typeorm';
import { join } from 'path';

const entityPaths = [
  join(__dirname, '/modules/**/entities/*.entity{.ts,.js}'),
  join(__dirname, '/shared/**/*.entity{.ts,.js}'),
];

export const TestDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5480', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'aala_land_test',

  entities: entityPaths,
  migrations: [join(__dirname, '/database/migrations/*{.ts,.js}')],
  synchronize: false,
  logging: true,
});
