import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Company } from '@modules/companies/entities/company.entity';
import { User } from '@modules/users/entities/user.entity';
import { Role } from '@shared/enums/roles.enum';
import { v4 as uuidv4 } from 'uuid';

export interface TestSeedResult {
  companies: Company[];
  users: User[];
}

export async function runTestSeed(dataSource: DataSource): Promise<TestSeedResult> {
  const existingUsers = await dataSource.query(`SELECT id FROM users WHERE role = 'super_admin'`);
  if (existingUsers.length > 0) {
    return { companies: [], users: [] };
  }

  await dataSource.query('TRUNCATE TABLE companies CASCADE');
  await dataSource.query('TRUNCATE TABLE users CASCADE');

  const superAdminId = uuidv4();
  const companyId = uuidv4();

  await dataSource.query(
    'INSERT INTO companies (id, name, slug, is_active, active_regions, default_region_code) VALUES ($1, $2, $3, $4, $5, $6)',
    [companyId, 'Super Admin Organization', 'super-org', true, '["dubai"]', 'dubai']
  );

  const hashedPassword = await bcrypt.hash('Admin@123!', 12);

  await dataSource.query(
    'INSERT INTO users (id, name, email, password, role, company_id, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [superAdminId, 'Super Admin', 'admin@aala.land', hashedPassword, 'super_admin', companyId, true]
  );

  const users: User[] = [
    { id: superAdminId, name: 'Super Admin', email: 'test@aala.land', password: hashedPassword, role: Role.SUPER_ADMIN, isActive: true } as User,
  ];

  return { companies: [], users };
}

export async function teardownTestSeed(dataSource: DataSource): Promise<void> {
  await dataSource.query('TRUNCATE TABLE companies CASCADE');
}
