import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Company } from '@modules/companies/entities/company.entity';
import { User } from '@modules/users/entities/user.entity';
import { Role } from '@shared/enums/roles.enum';

export interface TestSeedResult {
  companies: Company[];
  users: User[];
}

export async function runTestSeed(dataSource: DataSource): Promise<TestSeedResult> {
  const companyRepo = dataSource.getRepository(Company);
  const userRepo = dataSource.getRepository(User);

  // Clean existing test data - CASCADE handles FK dependencies
  await dataSource.query('TRUNCATE TABLE companies CASCADE');

  // Create test companies
  const companies = await companyRepo.save([
    companyRepo.create({ name: 'Test Company', slug: 'test-company' }),
    companyRepo.create({ name: 'Agent Company', slug: 'agent-company' }),
  ]);

  // Create test users with hashed passwords
  const hashedAdminPassword = await bcrypt.hash('Admin123!', 12);
  const hashedAgentPassword = await bcrypt.hash('Agent123!', 12);

  const users = await userRepo.save([
    userRepo.create({
      name: 'Test Admin',
      email: 'admin@test.com',
      password: hashedAdminPassword,
      role: Role.COMPANY_ADMIN,
      companyId: companies[0].id,
    }),
    userRepo.create({
      name: 'Test Agent',
      email: 'agent@test.com',
      password: hashedAgentPassword,
      role: Role.AGENT,
      companyId: companies[1].id,
    }),
  ]);

  return { companies, users };
}

export async function teardownTestSeed(dataSource: DataSource): Promise<void> {
  await dataSource.query('TRUNCATE TABLE companies CASCADE');
}
