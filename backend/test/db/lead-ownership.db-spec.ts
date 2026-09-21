import { DataSource, EntityManager } from 'typeorm';
import { connectTestDatabase } from './test-data-source';
import { Company } from '../../src/modules/companies/entities/company.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { Lead, LeadStatus } from '../../src/modules/leads/entities/lead.entity';
import { Role } from '../../src/shared/enums/roles.enum';
import {
  AgentLoadRow,
  CensusRow,
  agentLoadQuery,
  closedWindowStart,
  leadCensusQuery,
  shapeLeadOwnership,
} from '../../src/modules/reports/lead-ownership.query';

// The SQL in lead-ownership.query.ts is a string until a database parses it. These run it.
describe('lead ownership against a real database', () => {
  let dataSource: DataSource;

  const DUBAI = 'dubai';
  const RIYADH = 'riyadh';
  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    dataSource = await connectTestDatabase();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  class Rollback extends Error {}

  // Every case seeds, queries and rolls back, so the database is unchanged either way.
  async function seeded<T>(run: (manager: EntityManager) => Promise<T>) {
    let captured: T;
    try {
      await dataSource.transaction(async (manager) => {
        captured = await run(manager);
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    return captured!;
  }

  async function company(manager: EntityManager) {
    const suffix = Math.random().toString(36).slice(2, 10);
    return manager.getRepository(Company).save(
      manager.getRepository(Company).create({
        name: `Ownership Co ${suffix}`,
        slug: `ownership-co-${suffix}`,
        activeRegions: [DUBAI, RIYADH],
        defaultRegionCode: DUBAI,
      }),
    );
  }

  async function agent(
    manager: EntityManager,
    companyId: string,
    name: string,
    regionCodes: string[] = [DUBAI],
  ) {
    const suffix = Math.random().toString(36).slice(2, 10);
    return manager.getRepository(User).save(
      manager.getRepository(User).create({
        name,
        email: `${name.toLowerCase()}.${suffix}@example.com`,
        password: 'not-a-real-hash',
        role: Role.AGENT,
        companyId,
        regionCodes,
        isActive: true,
      }),
    );
  }

  async function lead(
    manager: EntityManager,
    companyId: string,
    status: LeadStatus,
    assignedTo: string | null,
    stageEnteredAt: Date | null = new Date(),
    regionCode: string = DUBAI,
  ) {
    return manager.getRepository(Lead).save(
      manager.getRepository(Lead).create({
        companyId,
        status,
        assignedTo,
        stageEnteredAt,
        regionCode,
      }),
    );
  }

  async function ownership(
    manager: EntityManager,
    companyId: string,
    regionCodes: string[] | null,
  ) {
    const closedSince = closedWindowStart();
    const rows = await agentLoadQuery(
      manager.getRepository(User),
      companyId,
      regionCodes,
      closedSince,
    ).getRawMany<AgentLoadRow>();
    const census = await leadCensusQuery(
      manager.getRepository(Lead),
      companyId,
      regionCodes,
      closedSince,
    ).getRawMany<CensusRow>();
    return shapeLeadOwnership(rows, census);
  }

  it('lists an agent holding nothing, which is what the JOIN placement buys', async () => {
    const result = await seeded(async (manager) => {
      const co = await company(manager);
      const busy = await agent(manager, co.id, 'Busy');
      await agent(manager, co.id, 'Idle');
      await lead(manager, co.id, LeadStatus.NEW, busy.id);
      return ownership(manager, co.id, null);
    });

    const names = result.agents.map((a) => a.agentName).sort();
    expect(names).toEqual(['Busy', 'Idle']);
    const idle = result.agents.find((a) => a.agentName === 'Idle');
    expect(idle?.openTotal).toBe(0);
    expect(idle?.won).toBe(0);
  });

  it('counts a recent close and drops one past the 30-day window', async () => {
    const result = await seeded(async (manager) => {
      const co = await company(manager);
      const owner = await agent(manager, co.id, 'Closer');
      await lead(manager, co.id, LeadStatus.WON, owner.id, daysAgo(10));
      await lead(manager, co.id, LeadStatus.LOST, owner.id, daysAgo(40));
      return ownership(manager, co.id, null);
    });

    const closer = result.agents.find((a) => a.agentName === 'Closer');
    expect(closer?.won).toBe(1);
    expect(closer?.lost).toBe(0);
    expect(result.won).toBe(1);
    expect(result.lost).toBe(0);
  });

  it('counts open leads with no owner as unassigned, and still lists them in the pipeline', async () => {
    const result = await seeded(async (manager) => {
      const co = await company(manager);
      const owner = await agent(manager, co.id, 'Owner');
      await lead(manager, co.id, LeadStatus.NEW, owner.id);
      await lead(manager, co.id, LeadStatus.NEW, null);
      await lead(manager, co.id, LeadStatus.VIEWING, null);
      return ownership(manager, co.id, null);
    });

    expect(result.unassignedOpen).toBe(2);
    const byStage = new Map(result.pipeline.map((p) => [p.stage, p.count]));
    expect(byStage.get(LeadStatus.NEW)).toBe(2);
    expect(byStage.get(LeadStatus.VIEWING)).toBe(1);
  });

  it('honours the region filter on both the roster and the census', async () => {
    const result = await seeded(async (manager) => {
      const co = await company(manager);
      const dubai = await agent(manager, co.id, 'Dubai', [DUBAI]);
      const riyadh = await agent(manager, co.id, 'Riyadh', [RIYADH]);
      await lead(manager, co.id, LeadStatus.NEW, dubai.id, new Date(), DUBAI);
      await lead(manager, co.id, LeadStatus.NEW, riyadh.id, new Date(), RIYADH);
      return ownership(manager, co.id, [DUBAI]);
    });

    const byStage = new Map(result.pipeline.map((p) => [p.stage, p.count]));
    expect(byStage.get(LeadStatus.NEW)).toBe(1);
    expect(result.agents.map((a) => a.agentName)).toEqual(['Dubai']);
  });

  it("never counts another company's leads", async () => {
    const result = await seeded(async (manager) => {
      const mine = await company(manager);
      const theirs = await company(manager);
      const owner = await agent(manager, mine.id, 'Mine');
      await lead(manager, mine.id, LeadStatus.NEW, owner.id);
      const stranger = await agent(manager, theirs.id, 'Theirs');
      await lead(manager, theirs.id, LeadStatus.NEW, stranger.id);
      return ownership(manager, mine.id, null);
    });

    expect(result.agents.map((a) => a.agentName)).toEqual(['Mine']);
    expect(result.agents[0].openTotal).toBe(1);
  });
});
