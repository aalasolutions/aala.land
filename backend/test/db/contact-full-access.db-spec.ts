import { DataSource, EntityManager } from 'typeorm';
import { connectTestDatabase } from './test-data-source';
import { seedCompany, seeded as sharedSeeded } from './harness';
import { User } from '../../src/modules/users/entities/user.entity';
import { Contact } from '../../src/modules/contacts/entities/contact.entity';
import {
  ContactAccessRequest,
  ContactAccessStatus,
} from '../../src/modules/contact-access-requests/entities/contact-access-request.entity';
import { ContactAccessRequestsService } from '../../src/modules/contact-access-requests/contact-access-requests.service';
import {
  ContactPrivacyService,
  ContactViewer,
} from '../../src/modules/contacts/contact-privacy.service';
import { Role } from '../../src/shared/enums/roles.enum';

// fullAccessSql is the SQL twin of accessLevelFor; this runs both on real rows and compares them.
describe('contact full access SQL against a real database', () => {
  let dataSource: DataSource;

  const DUBAI = 'dubai';
  const RIYADH = 'riyadh';

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  const seeded = <T>(run: (manager: EntityManager) => Promise<T>) =>
    sharedSeeded(dataSource, run);

  function privacyFor(manager: EntityManager) {
    const grants = new ContactAccessRequestsService(
      manager.getRepository(ContactAccessRequest),
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );
    return new ContactPrivacyService(null as never, null as never, grants);
  }

  async function user(
    manager: EntityManager,
    companyId: string,
    role: Role,
    regionCodes: string[],
  ) {
    const suffix = Math.random().toString(36).slice(2, 10);
    return manager.getRepository(User).save(
      manager.getRepository(User).create({
        name: `Test User ${suffix}`,
        email: `user.${suffix}@example.com`,
        password: 'not-a-real-hash',
        role,
        companyId,
        regionCodes,
        isActive: true,
      }),
    );
  }

  async function contact(
    manager: EntityManager,
    companyId: string,
    regionCode: string,
    createdBy: string,
  ) {
    return manager.getRepository(Contact).save(
      manager.getRepository(Contact).create({
        companyId,
        regionCode,
        createdBy,
        firstName: 'Test',
        lastName: 'Contact',
      }),
    );
  }

  async function request(
    manager: EntityManager,
    c: Contact,
    requesterId: string,
    status: ContactAccessStatus,
    expiresAt: Date | null = null,
  ) {
    await manager.getRepository(ContactAccessRequest).save(
      manager.getRepository(ContactAccessRequest).create({
        companyId: c.companyId,
        contactId: c.id,
        requesterId,
        regionCode: c.regionCode,
        status,
        expiresAt,
      }),
    );
  }

  async function fullBySql(
    manager: EntityManager,
    companyId: string,
    viewer: ContactViewer,
  ): Promise<string[]> {
    const qb = manager
      .getRepository(Contact)
      .createQueryBuilder('fc')
      .select('fc.id', 'id')
      .where('fc.company_id = :companyId', { companyId });
    const full = privacyFor(manager).fullAccessSql('fc', viewer);
    if (full) qb.andWhere(full.sql, full.params);
    const rows = await qb.getRawMany<{ id: string }>();
    return rows.map((row) => row.id).sort();
  }

  async function fullByCode(
    manager: EntityManager,
    companyId: string,
    viewer: ContactViewer,
    contacts: Contact[],
  ): Promise<string[]> {
    const levels = await privacyFor(manager).accessLevelFor(
      companyId,
      viewer,
      contacts,
    );
    return contacts
      .filter((c) => levels.get(c.id) === 'FULL')
      .map((c) => c.id)
      .sort();
  }

  it('agrees with accessLevelFor for every role and every way to hold a contact', async () => {
    const results = await seeded(async (manager) => {
      const company = await seedCompany(manager, 'Full Access Co', [
        DUBAI,
        RIYADH,
      ]);
      const agent = await user(manager, company.id, Role.AGENT, [DUBAI]);
      const otherAgent = await user(manager, company.id, Role.AGENT, [DUBAI]);
      const mgr = await user(manager, company.id, Role.MANAGER, [DUBAI]);
      const accountant = await user(manager, company.id, Role.ACCOUNTANT, [
        DUBAI,
      ]);
      const admin = await user(manager, company.id, Role.COMPANY_ADMIN, []);

      const byOther = await contact(manager, company.id, DUBAI, otherAgent.id);
      const own = await contact(manager, company.id, DUBAI, agent.id);
      const approved = await contact(
        manager,
        company.id,
        RIYADH,
        otherAgent.id,
      );
      const expired = await contact(manager, company.id, DUBAI, otherAgent.id);
      const pending = await contact(manager, company.id, DUBAI, otherAgent.id);
      const riyadhByManager = await contact(
        manager,
        company.id,
        RIYADH,
        mgr.id,
      );
      await request(manager, approved, agent.id, ContactAccessStatus.APPROVED);
      await request(
        manager,
        expired,
        agent.id,
        ContactAccessStatus.APPROVED,
        new Date(Date.now() - 60_000),
      );
      await request(manager, pending, agent.id, ContactAccessStatus.PENDING);
      const all = [byOther, own, approved, expired, pending, riyadhByManager];

      const viewers: ContactViewer[] = [agent, mgr, accountant, admin].map(
        (u) => ({ userId: u.id, role: u.role, regionCodes: u.regionCodes }),
      );
      const compared: { role: string; sql: string[]; code: string[] }[] = [];
      for (const viewer of viewers) {
        compared.push({
          role: viewer.role,
          sql: await fullBySql(manager, company.id, viewer),
          code: await fullByCode(manager, company.id, viewer, all),
        });
      }
      return {
        compared,
        agentFull: compared[0].sql,
        expect: [own.id, approved.id].sort(),
      };
    });

    for (const { role, sql, code } of results.compared) {
      expect({ role, ids: sql }).toEqual({ role, ids: code });
    }
    expect(results.agentFull).toEqual(results.expect);
  });
});
