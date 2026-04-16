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
  // Clean existing test data - CASCADE handles FK dependencies
  await dataSource.query('TRUNCATE TABLE companies CASCADE');

  // Create test companies using raw SQL (only fields that exist in database)
  const company1Id = uuidv4();
  const company2Id = uuidv4();

  await dataSource.query(
    `INSERT INTO companies (id, name, slug, is_active, active_regions, default_region_code)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [company1Id, 'Test Company', 'test-company', true, '["dubai"]', 'dubai']
  );

  await dataSource.query(
    `INSERT INTO companies (id, name, slug, is_active, active_regions, default_region_code)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [company2Id, 'Agent Company', 'agent-company', true, '["dubai"]', 'dubai']
  );

  // Create test users with hashed passwords using raw SQL
  const hashedAdminPassword = await bcrypt.hash('Admin123!', 12);
  const hashedAgentPassword = await bcrypt.hash('Agent123!', 12);

  const adminId = uuidv4();
  const agentId = uuidv4();

  await dataSource.query(
    `INSERT INTO users (id, name, email, password, role, company_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [adminId, 'Test Admin', 'admin@test.com', hashedAdminPassword, 'admin', company1Id, true]
  );

  await dataSource.query(
    `INSERT INTO users (id, name, email, password, role, company_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [agentId, 'Test Agent', 'agent@test.com', hashedAgentPassword, 'agent', company2Id, true]
  );

  // Return entity objects
  const companies: Company[] = [
    { id: company1Id, name: 'Test Company', slug: 'test-company', isActive: true } as Company,
    { id: company2Id, name: 'Agent Company', slug: 'agent-company', isActive: true } as Company,
  ];

  const users: User[] = [
    { id: adminId, name: 'Test Admin', email: 'admin@test.com', password: hashedAdminPassword, role: Role.COMPANY_ADMIN, companyId: company1Id, isActive: true } as User,
    { id: agentId, name: 'Test Agent', email: 'agent@test.com', password: hashedAgentPassword, role: Role.AGENT, companyId: company2Id, isActive: true } as User,
  ];

  return { companies, users };
}

export async function teardownTestSeed(dataSource: DataSource): Promise<void> {
  await dataSource.query('TRUNCATE TABLE companies CASCADE');
}
