import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '@modules/users/entities/user.entity';
import { Role } from '@shared/enums/roles.enum';
import { v4 as uuidv4 } from 'uuid';

export interface TestSeedResult {
  users: User[];
}

export async function runTestSeed(dataSource: DataSource): Promise<TestSeedResult> {
  const existingUsers = await dataSource.query(
    `SELECT id FROM users WHERE role = 'super_admin'`,
  );
  if (existingUsers.length > 0) {
    return { users: [] };
  }
  await dataSource.query('TRUNCATE TABLE companies CASCADE');
  await dataSource.query('TRUNCATE TABLE users CASCADE');

  const superAdminId = uuidv4();
  const hashedPassword = await bcrypt.hash('Admin@123!', 12);
  await dataSource.query(
    'INSERT INTO users (id, name, email, password, role, company_id, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [superAdminId, 'Super Admin', 'admin@aala.land', hashedPassword, 'super_admin', null, true]
  );
  const users: User[] = [
    {id: superAdminId, name: 'Super Admin', email: 'admin@aala.land', password: hashedPassword, role: Role.SUPER_ADMIN, companyId: null, isActive: true, } as unknown as User,
  ];
  return { users };
}

export async function teardownTestSeed(dataSource: DataSource): Promise<void> {
  await dataSource.query('TRUNCATE TABLE companies CASCADE');
}
