import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { AuditAction } from '../audit/dto/query-audit-logs.dto';
import { ReportsService } from './reports.service';
import { Lead, LeadStatus } from '../leads/entities/lead.entity';
import {
  LeadActivity,
  ActivityType,
} from '../leads/entities/lead-activity.entity';
import { Transaction } from '../financial/entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Commission } from '../commissions/entities/commission.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { Cheque } from '../cheques/entities/cheque.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import {
  isDateOnly,
  regionTimezoneSql,
} from '../../shared/utils/region-time.util';
import { User } from '../users/entities/user.entity';
import { Contact } from '../contacts/entities/contact.entity';

function createMockQueryBuilder(result: any = []) {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(result),
    getRawOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('ReportsService', () => {
  let service: ReportsService;
  let leadRepo: any;
  let activityRepo: any;
  let transactionRepo: any;
  let unitRepo: any;
  let commissionRepo: any;
  let leaseRepo: any;
  let chequeRepo: any;
  let auditLogRepo: any;
  let userRepo: any;
  let contactRepo: any;

  const companyId = 'company-uuid-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(Lead),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(LeadActivity),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Commission),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Lease),
          useValue: {
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Cheque),
          useValue: {
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            find: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Contact),
          useValue: {
            count: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    leadRepo = module.get(getRepositoryToken(Lead));
    activityRepo = module.get(getRepositoryToken(LeadActivity));
    transactionRepo = module.get(getRepositoryToken(Transaction));
    unitRepo = module.get(getRepositoryToken(Unit));
    commissionRepo = module.get(getRepositoryToken(Commission));
    leaseRepo = module.get(getRepositoryToken(Lease));
    chequeRepo = module.get(getRepositoryToken(Cheque));
    auditLogRepo = module.get(getRepositoryToken(AuditLog));
    userRepo = module.get(getRepositoryToken(User));
    contactRepo = module.get(getRepositoryToken(Contact));
    userRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));
    unitRepo.createQueryBuilder.mockReturnValue(
      createMockQueryBuilder({ rentalUnits: 0, occupiedUnits: 0 }),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardKpis', () => {
    it('returns correct flat KPIs', async () => {
      leadRepo.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(3);
      contactRepo.count.mockResolvedValue(42);
      unitRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({ rentalUnits: 8, occupiedUnits: 3 }),
      );

      const txnQb = createMockQueryBuilder({ total: '15000' });
      transactionRepo.createQueryBuilder.mockReturnValue(txnQb);

      unitRepo.count.mockResolvedValue(20);
      leaseRepo.count.mockResolvedValue(5);
      chequeRepo.count.mockResolvedValue(2);

      const result = await service.getDashboardKpis(companyId);

      expect(result.totalLeads).toBe(10);
      expect(result.openLeads).toBe(6);
      expect(result.wonLeads).toBe(3);
      expect(result.totalContacts).toBe(42);
      expect(result.totalUnits).toBe(20);
      expect(result.rentalUnits).toBe(8);
      expect(result.occupiedUnits).toBe(3);
      expect(result.monthlyRevenue).toBe(15000);
      expect(result.activeLeases).toBe(5);
      expect(result.pendingCheques).toBe(2);
    });

    it('counts occupancy over For Rent units, rented status or an active lease', async () => {
      leadRepo.count.mockResolvedValue(0);
      transactionRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({ total: '0' }),
      );
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chequeRepo.count.mockResolvedValue(0);
      const occupancyQb = createMockQueryBuilder({
        rentalUnits: 4,
        occupiedUnits: 2,
      });
      unitRepo.createQueryBuilder.mockReturnValue(occupancyQb);

      await service.getDashboardKpis(companyId);

      expect(occupancyQb.andWhere).toHaveBeenCalledWith(
        'u.property_type = :rental',
        { rental: 'RENTAL' },
      );
      expect(occupancyQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('u.status IN (:...rentableStatuses) OR EXISTS'),
        { rentableStatuses: ['available', 'rented'] },
      );
      const occupied = occupancyQb.addSelect.mock.calls[0][0] as string;
      expect(occupied).toContain('u.status = :rented OR EXISTS');
      expect(occupied).toContain('le.deleted_at IS NULL');
      expect(occupancyQb.setParameter).toHaveBeenCalledWith('rented', 'rented');
      expect(occupancyQb.setParameter).toHaveBeenCalledWith(
        'activeLease',
        LeaseStatus.ACTIVE,
      );
    });

    it('windows monthly revenue on the business date, not on created_at', async () => {
      leadRepo.count.mockResolvedValue(0);
      const txnQb = createMockQueryBuilder({ total: '0' });
      transactionRepo.createQueryBuilder.mockReturnValue(txnQb);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chequeRepo.count.mockResolvedValue(0);

      await service.getDashboardKpis(companyId);

      const monthClause = txnQb.andWhere.mock.calls
        .map((call: any[]) => call[0])
        .find(
          (clause: unknown) =>
            typeof clause === 'string' && clause.includes('date_trunc'),
        );

      expect(monthClause).toContain('t.transaction_date');
      expect(monthClause).not.toContain('t.created_at >=');
      // The month boundary still resolves in the row own region zone.
      expect(monthClause).toContain(regionTimezoneSql('t.region_code'));
      // Bounded above, because the trend series drops a future month.
      expect(monthClause).toContain("INTERVAL '1 month'");
    });

    it('buckets the trend on the same business date the KPI windows on', async () => {
      const trendQb = createMockQueryBuilder([]);
      transactionRepo.createQueryBuilder.mockReturnValue(trendQb);

      await service.getRevenueTrend(companyId, 6);

      expect(trendQb.select.mock.calls[0][0]).toContain('t.transaction_date');
    });
  });

  describe('getAgentPerformance', () => {
    it('aggregates performance per agent', async () => {
      const leadQb = createMockQueryBuilder([
        { agentId: 'agent-1', leadsAssigned: 5, leadsWon: 3, leadsLost: 1 },
        { agentId: 'agent-2', leadsAssigned: 2, leadsWon: 0, leadsLost: 0 },
      ]);
      leadRepo.createQueryBuilder.mockReturnValue(leadQb);

      const commQb = createMockQueryBuilder([
        { agentId: 'agent-1', commissionsEarned: '2000' },
      ]);
      commissionRepo.createQueryBuilder.mockReturnValue(commQb);

      const result = await service.getAgentPerformance(companyId);

      const agent1 = result.find((a) => a.agentId === 'agent-1');
      expect(agent1).toBeDefined();
      expect(agent1!.leadsAssigned).toBe(5);
      expect(agent1!.leadsWon).toBe(3);
      expect(agent1!.leadsLost).toBe(1);
      expect(agent1!.conversionRate).toBe(75);
      expect(agent1!.commissionsEarned).toBe(2000);
    });

    it('includes agents with commissions but no leads', async () => {
      const leadQb = createMockQueryBuilder([]);
      leadRepo.createQueryBuilder.mockReturnValue(leadQb);

      const commQb = createMockQueryBuilder([
        { agentId: 'agent-3', commissionsEarned: '1000' },
      ]);
      commissionRepo.createQueryBuilder.mockReturnValue(commQb);

      const result = await service.getAgentPerformance(companyId);

      const agent3 = result.find((a) => a.agentId === 'agent-3');
      expect(agent3).toBeDefined();
      expect(agent3!.commissionsEarned).toBe(1000);
      expect(agent3!.leadsAssigned).toBe(0);
    });
  });

  describe('getLeadOwnership', () => {
    const rowFor = (overrides: any) => ({
      agentId: 'agent-1',
      agentName: 'Agent One',
      newCount: 0,
      contactedCount: 0,
      viewingCount: 0,
      negotiatingCount: 0,
      wonCount: 0,
      lostCount: 0,
      ...overrides,
    });

    it('sorts agents by open load and breaks the load down by stage', async () => {
      userRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          rowFor({ agentId: 'agent-light', agentName: 'Bea', newCount: 1 }),
          rowFor({
            agentId: 'agent-heavy',
            agentName: 'Ana',
            newCount: 6,
            contactedCount: 4,
            viewingCount: 2,
            wonCount: 2,
            lostCount: 1,
          }),
        ]),
      );
      leadRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          { stage: 'NEW', count: 9, unassigned: 3 },
          { stage: 'CONTACTED', count: 7, unassigned: 0 },
          { stage: 'WON', count: 2, unassigned: 0 },
        ]),
      );

      const result = await service.getLeadOwnership(companyId);

      expect(result.agents.map((a) => a.agentId)).toEqual([
        'agent-heavy',
        'agent-light',
      ]);

      const heavy = result.agents[0];
      expect(heavy.openTotal).toBe(12);
      expect(heavy.won).toBe(2);
      expect(heavy.lost).toBe(1);
      expect(heavy.stages).toEqual([
        { stage: LeadStatus.NEW, count: 6 },
        { stage: LeadStatus.CONTACTED, count: 4 },
        { stage: LeadStatus.VIEWING, count: 2 },
        { stage: LeadStatus.NEGOTIATING, count: 0 },
      ]);
      expect(result.unassignedOpen).toBe(3);
      expect(result.pipeline).toEqual([
        { stage: LeadStatus.NEW, count: 9 },
        { stage: LeadStatus.CONTACTED, count: 7 },
        { stage: LeadStatus.VIEWING, count: 0 },
        { stage: LeadStatus.NEGOTIATING, count: 0 },
      ]);
      expect(result.won).toBe(2);
      expect(result.lost).toBe(0);
    });

    it('keeps agents holding no leads, sorted last', async () => {
      userRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          rowFor({ agentId: 'agent-idle', agentName: 'Zed' }),
          rowFor({ agentId: 'agent-busy', agentName: 'Ana', newCount: 2 }),
        ]),
      );
      leadRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));

      const result = await service.getLeadOwnership(companyId);

      expect(result.agents.map((a) => a.agentId)).toEqual([
        'agent-busy',
        'agent-idle',
      ]);
      expect(result.agents[1].openTotal).toBe(0);
      expect(result.agents[1].won).toBe(0);
    });

    it('bounds closed leads to the 30 day window in the join', async () => {
      const qb = createMockQueryBuilder([]);
      userRepo.createQueryBuilder.mockReturnValue(qb);
      leadRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));

      await service.getLeadOwnership(companyId);

      const joinCondition = qb.leftJoin.mock.calls[0][2];
      expect(joinCondition).toContain('l.stageEnteredAt >= :closedSince');

      const params = qb.setParameters.mock.calls[0][0];
      const daysBack =
        (Date.now() - new Date(params.closedSince).getTime()) / 86400000;
      expect(Math.round(daysBack)).toBe(30);
    });

    it('lists an agent only when assigned to a readable region', async () => {
      const qb = createMockQueryBuilder([]);
      userRepo.createQueryBuilder.mockReturnValue(qb);
      leadRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));

      await service.getLeadOwnership(companyId, undefined, {
        role: 'agent',
        regionCodes: ['makkah'],
      } as any);

      const having = qb.having.mock.calls[0][0];
      expect(having).toContain('jsonb_array_elements_text');
      expect(having).toContain('COUNT(l.id) > 0');
    });

    it('skips the region predicate when the caller reads every region', async () => {
      const qb = createMockQueryBuilder([]);
      userRepo.createQueryBuilder.mockReturnValue(qb);
      leadRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));

      await service.getLeadOwnership(companyId);

      expect(qb.having.mock.calls[0][0]).not.toContain(
        'jsonb_array_elements_text',
      );
    });

    it('returns nothing when the caller can read no region', async () => {
      const result = await service.getLeadOwnership(companyId, undefined, {
        role: 'agent',
        regionCodes: [],
      } as any);

      expect(result.agents).toEqual([]);
      expect(result.unassignedOpen).toBe(0);
      expect(result.pipeline.every((stage) => stage.count === 0)).toBe(true);
      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('getRedFlags', () => {
    it('returns red flags sorted by severity', async () => {
      const now = new Date();
      const hours49Ago = new Date(now.getTime() - 49 * 60 * 60 * 1000);

      leadRepo.find
        .mockResolvedValueOnce([
          {
            id: 'l1',
            firstName: 'Ahmed',
            lastName: 'Ali',
            createdAt: hours49Ago,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'l1',
            firstName: 'Ahmed',
            lastName: 'Ali',
            createdAt: hours49Ago,
          },
        ])
        .mockResolvedValueOnce([]);

      const overdueQb = createMockQueryBuilder([]);
      leadRepo.createQueryBuilder.mockReturnValue(overdueQb);

      unitRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));

      const result = await service.getRedFlags(companyId);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].type).toBe('UNTOUCHED_LEAD_48H');
      expect(result[0].severity).toBe('HIGH');
    });

    it('reports a vacant unit with its locality id and real vacant days', async () => {
      leadRepo.find.mockResolvedValue([]);
      leadRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));
      const vacantSince = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
      unitRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          { id: 'u1', unitNumber: '101', areaId: 'loc-1', vacantSince },
        ]),
      );

      const [flag] = await service.getRedFlags(companyId);

      expect(flag).toMatchObject({
        type: 'LONG_VACANT',
        entityId: 'u1',
        areaId: 'loc-1',
        message: 'Property 101 vacant for 45 days',
      });
      expect(flag.createdAt).toEqual(vacantSince);
    });

    it('counts only For Rent, available, non-archived units without an active lease', async () => {
      leadRepo.find.mockResolvedValue([]);
      leadRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));
      const unitQb = createMockQueryBuilder([]);
      unitRepo.createQueryBuilder.mockReturnValue(unitQb);

      await service.getRedFlags(companyId);

      const clauses = unitQb.andWhere.mock.calls.map((call: any[]) => call[0]);
      expect(clauses).toContain('u.deleted_at IS NULL');
      expect(clauses).toContain('u.status = :available');
      expect(clauses).toContain('u.property_type = :rental');
      expect(
        clauses.some(
          (sql: string) =>
            sql.includes('NOT EXISTS') && sql.includes(':activeLease'),
        ),
      ).toBe(true);
      expect(unitQb.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({
          activeLease: LeaseStatus.ACTIVE,
          terminatedLease: LeaseStatus.TERMINATED,
          terminatedStatus: LeaseStatus.TERMINATED,
          terminateAction: 'TERMINATE',
          statusChangeAction: 'STATUS_CHANGE',
          endedLeaseStatuses: [
            LeaseStatus.EXPIRED,
            LeaseStatus.TERMINATED,
            LeaseStatus.RENEWED,
          ],
        }),
      );
    });

    it('confines region-scoped vacant units through the city region', async () => {
      leadRepo.find.mockResolvedValue([]);
      leadRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));
      const unitQb = createMockQueryBuilder([]);
      unitRepo.createQueryBuilder.mockReturnValue(unitQb);

      await service.getRedFlags(companyId, undefined, {
        role: 'manager',
        regionCodes: ['makkah'],
      } as any);

      expect(unitQb.andWhere).toHaveBeenCalledWith(
        'ci.region_code IN (:...regionCodes)',
        { regionCodes: ['makkah'] },
      );
    });
  });

  describe('getDashboardKpis archived units', () => {
    it('counts only non-archived units', async () => {
      leadRepo.count.mockResolvedValue(0);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chequeRepo.count.mockResolvedValue(0);
      transactionRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({ total: '0' }),
      );

      await service.getDashboardKpis(companyId);

      expect(unitRepo.count).toHaveBeenCalledWith({
        where: { companyId, deletedAt: IsNull() },
      });
    });

    it('counts only non-archived active leases', async () => {
      leadRepo.count.mockResolvedValue(0);
      unitRepo.count.mockResolvedValue(0);
      leaseRepo.count.mockResolvedValue(0);
      chequeRepo.count.mockResolvedValue(0);
      transactionRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({ total: '0' }),
      );

      await service.getDashboardKpis(companyId);

      expect(leaseRepo.count).toHaveBeenCalledWith({
        where: { companyId, status: LeaseStatus.ACTIVE, deletedAt: IsNull() },
      });
    });
  });

  describe('getActivityFeed', () => {
    it('returns a page of activity with the actor name', async () => {
      const mockLogs = [
        {
          id: 'a1',
          action: 'CREATE',
          entityType: 'Lead',
          entityId: 'l1',
          userId: 'u1',
          user: { id: 'u1', name: 'Test User' },
          createdAt: new Date(),
        },
      ];
      auditLogRepo.findAndCount.mockResolvedValue([mockLogs, 41]);

      const result = await service.getActivityFeed(
        companyId,
        undefined,
        undefined,
        3,
        20,
      );

      expect(result.total).toBe(41);
      expect(result.page).toBe(3);
      expect(result.data[0].action).toBe('CREATE');
      expect(result.data[0].userName).toBe('Test User');
      expect(auditLogRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId, action: Not(AuditAction.LOGIN) },
          skip: 40,
          take: 20,
        }),
      );
    });

    it('excludes logins on every region branch', async () => {
      auditLogRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getActivityFeed(companyId, undefined, {
        role: 'admin',
        regionCodes: ['makkah'],
      } as any);

      const where = auditLogRepo.findAndCount.mock.calls[0][0].where;
      expect(where).toHaveLength(2);
      for (const branch of where) {
        expect(branch.action).toEqual(Not(AuditAction.LOGIN));
      }
    });

    it('returns an empty page when the caller has no region', async () => {
      const result = await service.getActivityFeed(companyId, undefined, {
        role: 'manager',
        regionCodes: [],
      } as any);

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      expect(auditLogRepo.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('getPipelineFunnel', () => {
    it('returns counts for each pipeline stage in order', async () => {
      const leadQb = createMockQueryBuilder([
        { stage: LeadStatus.NEW, count: 5 },
        { stage: LeadStatus.WON, count: 2 },
      ]);
      leadRepo.createQueryBuilder.mockReturnValue(leadQb);

      const result = await service.getPipelineFunnel(companyId);

      expect(result).toHaveLength(6);
      expect(result[0].stage).toBe(LeadStatus.NEW);
      expect(result[0].count).toBe(5);
      expect(result[4].stage).toBe(LeadStatus.WON);
      expect(result[4].count).toBe(2);
      expect(result[1].count).toBe(0); // CONTACTED not in mock data
    });
  });

  describe('getBottlenecks', () => {
    it('returns bottleneck data sorted by avgDays descending', async () => {
      const leadQb = createMockQueryBuilder([
        {
          stage: LeadStatus.NEGOTIATING,
          avgDays: '8.5',
          count: 3,
          slowestLeadDays: '14.2',
        },
        {
          stage: LeadStatus.CONTACTED,
          avgDays: '2.1',
          count: 5,
          slowestLeadDays: '5.0',
        },
      ]);
      leadRepo.createQueryBuilder.mockReturnValue(leadQb);

      const result = await service.getBottlenecks(companyId);

      expect(result).toHaveLength(2);
      expect(result[0].stage).toBe(LeadStatus.NEGOTIATING);
      expect(result[0].avgDays).toBe(8.5);
      expect(result[0].count).toBe(3);
      expect(result[0].slowestLeadDays).toBe(14.2);
      expect(result[1].stage).toBe(LeadStatus.CONTACTED);
      expect(result[1].avgDays).toBe(2.1);
    });

    it('returns empty array when no leads have stageEnteredAt', async () => {
      const leadQb = createMockQueryBuilder([]);
      leadRepo.createQueryBuilder.mockReturnValue(leadQb);

      const result = await service.getBottlenecks(companyId);

      expect(result).toEqual([]);
    });
  });

  describe('getResponseTimeMetrics', () => {
    it('returns response time per agent', async () => {
      const activityQb = createMockQueryBuilder([
        {
          agentId: 'agent-1',
          totalLeadsHandled: 5,
          avgResponseMinutes: '120.5',
        },
        {
          agentId: 'agent-2',
          totalLeadsHandled: 3,
          avgResponseMinutes: '45.0',
        },
      ]);
      activityRepo.createQueryBuilder.mockReturnValue(activityQb);

      const result = await service.getResponseTimeMetrics(companyId);

      expect(result).toHaveLength(2);
      expect(result[0].agentId).toBe('agent-1');
      expect(result[0].avgResponseMinutes).toBe(120.5);
      expect(result[0].totalLeadsHandled).toBe(5);
      expect(result[1].agentId).toBe('agent-2');
      expect(result[1].avgResponseMinutes).toBe(45);
    });

    it('returns empty array when no status changes exist', async () => {
      const activityQb = createMockQueryBuilder([]);
      activityRepo.createQueryBuilder.mockReturnValue(activityQb);

      const result = await service.getResponseTimeMetrics(companyId);

      expect(result).toEqual([]);
    });
  });
  describe('region scoping', () => {
    const makkahManager = { role: 'manager', regionCodes: ['makkah'] };
    const twoRegionManager = {
      role: 'manager',
      regionCodes: ['makkah', 'punjab'],
    };
    const admin = { role: 'company_admin', regionCodes: ['makkah'] };
    const unassignedManager = { role: 'manager', regionCodes: [] };

    // Stands in for Postgres: seeded rows survive only if the built predicate admits their region.
    function createRegionAwareQb(rows: any[]) {
      let codes: string[] | undefined;
      const capture = (_sql: string, params?: any) => {
        if (params && Array.isArray(params.regionCodes)) {
          codes = params.regionCodes as string[];
        }
        return qb;
      };
      const visible = () =>
        codes ? rows.filter((r) => codes!.includes(r.regionCode)) : rows;
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        where: jest.fn(capture),
        andWhere: jest.fn(capture),
        getRawMany: jest.fn(() => Promise.resolve(visible())),
        getMany: jest.fn(() => Promise.resolve(visible())),
        getCount: jest.fn(() => Promise.resolve(visible().length)),
        getRawOne: jest.fn(() =>
          Promise.resolve({
            total: visible()
              .reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
              .toString(),
          }),
        ),
      };
      return qb;
    }

    // Stands in for Postgres: In() carries the admitted regions on `.value`.
    function rowsMatchingWhere(rows: any[], where: any) {
      const codes = where?.regionCode?.value as string[] | undefined;
      const byRegion = codes
        ? rows.filter((r) => codes.includes(r.regionCode))
        : rows;
      const status = where?.status;
      const statuses: string[] | undefined =
        status?.value ?? (status ? [status] : undefined);
      return statuses
        ? byRegion.filter((r) => statuses.includes(r.status))
        : byRegion;
    }

    describe('getPipelineFunnel', () => {
      const stageRows = [
        { stage: LeadStatus.NEW, count: 3, regionCode: 'makkah' },
        { stage: LeadStatus.WON, count: 2, regionCode: 'punjab' },
      ];

      function countFor(result: any[], stage: LeadStatus) {
        return result.find((r) => r.stage === stage)!.count;
      }

      it('confines the funnel to the caller regions with no regionCode argument', async () => {
        leadRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(stageRows),
        );

        const result = await service.getPipelineFunnel(
          companyId,
          undefined,
          makkahManager,
        );

        expect(countFor(result, LeadStatus.NEW)).toBe(3);
        expect(countFor(result, LeadStatus.WON)).toBe(0);
      });

      it('counts nothing from a region outside the caller assignments', async () => {
        leadRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(stageRows),
        );

        const result = await service.getPipelineFunnel(
          companyId,
          'punjab',
          makkahManager,
        );

        expect(result.every((r) => r.count === 0)).toBe(true);
      });

      it('narrows to a requested region the caller is assigned to', async () => {
        leadRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(stageRows),
        );

        const result = await service.getPipelineFunnel(
          companyId,
          'punjab',
          twoRegionManager,
        );

        expect(countFor(result, LeadStatus.NEW)).toBe(0);
        expect(countFor(result, LeadStatus.WON)).toBe(2);
      });

      it('leaves the funnel unfiltered for admins', async () => {
        leadRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(stageRows),
        );

        const result = await service.getPipelineFunnel(
          companyId,
          undefined,
          admin,
        );

        expect(countFor(result, LeadStatus.NEW)).toBe(3);
        expect(countFor(result, LeadStatus.WON)).toBe(2);
      });

      it('stays unfiltered when no caller is supplied', async () => {
        leadRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(stageRows),
        );

        const result = await service.getPipelineFunnel(companyId);

        expect(countFor(result, LeadStatus.NEW)).toBe(3);
        expect(countFor(result, LeadStatus.WON)).toBe(2);
      });

      it('returns a zeroed funnel when the caller has no assigned region', async () => {
        leadRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(stageRows),
        );

        const result = await service.getPipelineFunnel(
          companyId,
          undefined,
          unassignedManager,
        );

        expect(result).toHaveLength(6);
        expect(result.every((r) => r.count === 0)).toBe(true);
        expect(leadRepo.createQueryBuilder).not.toHaveBeenCalled();
      });
    });

    describe('getAgentPerformance', () => {
      const leadRows = [
        {
          agentId: 'agent-makkah',
          leadsAssigned: 2,
          leadsWon: 1,
          leadsLost: 1,
          regionCode: 'makkah',
        },
        {
          agentId: 'agent-punjab',
          leadsAssigned: 4,
          leadsWon: 2,
          leadsLost: 2,
          regionCode: 'punjab',
        },
      ];
      const commissionRows = [
        {
          agentId: 'agent-punjab',
          commissionsEarned: '5000',
          regionCode: 'punjab',
        },
      ];

      function seed() {
        leadRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(leadRows),
        );
        commissionRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(commissionRows),
        );
      }

      it('confines agents to the caller regions with no regionCode argument', async () => {
        seed();

        const result = await service.getAgentPerformance(
          companyId,
          undefined,
          makkahManager,
        );

        expect(result.map((a) => a.agentId)).toEqual(['agent-makkah']);
      });

      it('excludes out-of-region commissions from the caller totals', async () => {
        seed();

        const result = await service.getAgentPerformance(
          companyId,
          undefined,
          makkahManager,
        );

        expect(result.some((a) => a.agentId === 'agent-punjab')).toBe(false);
        expect(result[0].commissionsEarned).toBe(0);
      });

      it('leaves agent performance unfiltered for admins', async () => {
        seed();

        const result = await service.getAgentPerformance(
          companyId,
          undefined,
          admin,
        );

        expect(result.map((a) => a.agentId).sort()).toEqual([
          'agent-makkah',
          'agent-punjab',
        ]);
        expect(
          result.find((a) => a.agentId === 'agent-punjab')!.commissionsEarned,
        ).toBe(5000);
      });

      it('returns no agents when the caller has no assigned region', async () => {
        seed();

        const result = await service.getAgentPerformance(
          companyId,
          undefined,
          unassignedManager,
        );

        expect(result).toEqual([]);
        expect(leadRepo.createQueryBuilder).not.toHaveBeenCalled();
        expect(commissionRepo.createQueryBuilder).not.toHaveBeenCalled();
      });

      it('confines achievements through the same scope', async () => {
        seed();

        const result = await service.getAchievements(
          companyId,
          undefined,
          makkahManager,
        );

        expect(result.every((a) => a.agentId === 'agent-makkah')).toBe(true);
      });

      it('confines the agent comparison through the same scope', async () => {
        seed();

        const result = await service.getAgentComparison(
          companyId,
          undefined,
          makkahManager,
        );

        expect(result.map((a) => a.agentId)).toEqual(['agent-makkah']);
      });
    });

    describe('getDashboardKpis', () => {
      const leadRows = [
        { id: 'lead-makkah', status: LeadStatus.WON, regionCode: 'makkah' },
        { id: 'lead-punjab', status: LeadStatus.WON, regionCode: 'punjab' },
        { id: 'lead-punjab-2', status: LeadStatus.NEW, regionCode: 'punjab' },
        { id: 'lead-makkah-2', status: LeadStatus.LOST, regionCode: 'makkah' },
        {
          id: 'lead-makkah-3',
          status: LeadStatus.VIEWING,
          regionCode: 'makkah',
        },
      ];
      const contactRows = [
        { id: 'contact-makkah', regionCode: 'makkah' },
        { id: 'contact-punjab', regionCode: 'punjab' },
        { id: 'contact-punjab-2', regionCode: 'punjab' },
      ];
      const unitRows = [
        { id: 'unit-makkah', regionCode: 'makkah' },
        { id: 'unit-punjab', regionCode: 'punjab' },
      ];

      function seed() {
        leadRepo.count.mockImplementation((opts: any) =>
          Promise.resolve(rowsMatchingWhere(leadRows, opts?.where).length),
        );
        contactRepo.count.mockImplementation((opts: any) =>
          Promise.resolve(rowsMatchingWhere(contactRows, opts?.where).length),
        );
        unitRepo.count.mockResolvedValue(unitRows.length);
        unitRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(unitRows),
        );
        transactionRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb([]),
        );
        leaseRepo.count.mockResolvedValue(0);
        leaseRepo.createQueryBuilder.mockReturnValue(createRegionAwareQb([]));
        chequeRepo.count.mockResolvedValue(0);
        chequeRepo.createQueryBuilder.mockReturnValue(createRegionAwareQb([]));
      }

      it('confines KPIs to the caller regions with no regionCode argument', async () => {
        seed();

        const result = await service.getDashboardKpis(
          companyId,
          undefined,
          makkahManager,
        );

        expect(result.totalLeads).toBe(3);
        expect(result.openLeads).toBe(1);
        expect(result.wonLeads).toBe(1);
        expect(result.totalContacts).toBe(1);
        expect(result.totalUnits).toBe(1);
      });

      it('counts nothing from a region outside the caller assignments', async () => {
        seed();

        const result = await service.getDashboardKpis(
          companyId,
          'punjab',
          makkahManager,
        );

        expect(result.totalLeads).toBe(0);
        expect(result.openLeads).toBe(0);
        expect(result.totalContacts).toBe(0);
        expect(result.totalUnits).toBe(0);
      });

      it('leaves KPIs unfiltered for admins', async () => {
        seed();

        const result = await service.getDashboardKpis(
          companyId,
          undefined,
          admin,
        );

        expect(result.totalLeads).toBe(5);
        expect(result.openLeads).toBe(2);
        expect(result.totalContacts).toBe(3);
        expect(result.totalUnits).toBe(2);
      });

      it('returns zeroed KPIs when the caller has no assigned region', async () => {
        seed();

        const result = await service.getDashboardKpis(
          companyId,
          undefined,
          unassignedManager,
        );

        expect(result).toEqual({
          totalLeads: 0,
          openLeads: 0,
          wonLeads: 0,
          totalContacts: 0,
          totalUnits: 0,
          rentalUnits: 0,
          occupiedUnits: 0,
          monthlyRevenue: 0,
          activeLeases: 0,
          pendingCheques: 0,
        });
        expect(leadRepo.count).not.toHaveBeenCalled();
        expect(contactRepo.count).not.toHaveBeenCalled();
        expect(unitRepo.count).not.toHaveBeenCalled();
        expect(unitRepo.createQueryBuilder).not.toHaveBeenCalled();
      });

      it('excludes archived leases from the region-scoped active count', async () => {
        seed();
        const leaseQb = leaseRepo.createQueryBuilder();

        await service.getDashboardKpis(companyId, undefined, makkahManager);

        expect(leaseQb.andWhere).toHaveBeenCalledWith('l.deleted_at IS NULL');
      });

      it('counts active leases by their own region column, not the unit chain', async () => {
        seed();
        const leaseQb = leaseRepo.createQueryBuilder();

        await service.getDashboardKpis(companyId, undefined, makkahManager);

        expect(leaseQb.andWhere).toHaveBeenCalledWith(
          'l.region_code IN (:...regionCodes)',
          { regionCodes: ['makkah'] },
        );
        expect(leaseQb.innerJoin).not.toHaveBeenCalled();
      });
    });

    describe('getBottlenecks', () => {
      const stageRows = [
        {
          stage: LeadStatus.NEGOTIATING,
          avgDays: '8.5',
          count: 3,
          slowestLeadDays: '14.2',
          regionCode: 'makkah',
        },
        {
          stage: LeadStatus.CONTACTED,
          avgDays: '2.1',
          count: 5,
          slowestLeadDays: '5.0',
          regionCode: 'punjab',
        },
      ];

      it('confines bottlenecks to the caller regions with no regionCode argument', async () => {
        leadRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(stageRows),
        );

        const result = await service.getBottlenecks(
          companyId,
          undefined,
          makkahManager,
        );

        expect(result.map((r) => r.stage)).toEqual([LeadStatus.NEGOTIATING]);
      });

      it('leaves bottlenecks unfiltered for admins', async () => {
        leadRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(stageRows),
        );

        const result = await service.getBottlenecks(
          companyId,
          undefined,
          admin,
        );

        expect(result).toHaveLength(2);
      });

      it('returns no bottlenecks when the caller has no assigned region', async () => {
        leadRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(stageRows),
        );

        const result = await service.getBottlenecks(
          companyId,
          undefined,
          unassignedManager,
        );

        expect(result).toEqual([]);
        expect(leadRepo.createQueryBuilder).not.toHaveBeenCalled();
      });
    });

    describe('getRedFlags', () => {
      const staleLeads = [
        {
          id: 'lead-makkah',
          status: LeadStatus.NEW,
          regionCode: 'makkah',
          createdAt: new Date(0),
          updatedAt: new Date(0),
          contact: { firstName: 'Makkah', lastName: 'Lead' },
        },
        {
          id: 'lead-punjab',
          status: LeadStatus.NEW,
          regionCode: 'punjab',
          createdAt: new Date(0),
          updatedAt: new Date(0),
          contact: { firstName: 'Punjab', lastName: 'Lead' },
        },
      ];
      const vacantUnits = [
        {
          id: 'unit-makkah',
          unitNumber: '101',
          areaId: 'loc-makkah',
          regionCode: 'makkah',
          vacantSince: new Date(0),
        },
        {
          id: 'unit-punjab',
          unitNumber: '201',
          areaId: 'loc-punjab',
          regionCode: 'punjab',
          vacantSince: new Date(0),
        },
      ];

      function seed() {
        leadRepo.find.mockImplementation((opts: any) =>
          Promise.resolve(rowsMatchingWhere(staleLeads, opts?.where)),
        );
        leadRepo.createQueryBuilder.mockReturnValue(createRegionAwareQb([]));
        unitRepo.createQueryBuilder.mockReturnValue(
          createRegionAwareQb(vacantUnits),
        );
      }

      it('confines flags to the caller regions with no regionCode argument', async () => {
        seed();

        const result = await service.getRedFlags(
          companyId,
          undefined,
          makkahManager,
        );

        expect(result.map((f) => f.entityId).sort()).toEqual([
          'lead-makkah',
          'unit-makkah',
        ]);
      });

      it('leaves flags unfiltered for admins', async () => {
        seed();

        const result = await service.getRedFlags(companyId, undefined, admin);

        expect(result.map((f) => f.entityId).sort()).toEqual([
          'lead-makkah',
          'lead-punjab',
          'unit-makkah',
          'unit-punjab',
        ]);
      });

      it('returns no flags when the caller has no assigned region', async () => {
        seed();

        const result = await service.getRedFlags(
          companyId,
          undefined,
          unassignedManager,
        );

        expect(result).toEqual([]);
        expect(leadRepo.find).not.toHaveBeenCalled();
        expect(unitRepo.find).not.toHaveBeenCalled();
        expect(unitRepo.createQueryBuilder).not.toHaveBeenCalled();
      });
    });
  });
  describe('getRevenueTrend', () => {
    it('returns a zero-filled series of six months, oldest first', async () => {
      transactionRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([]),
      );

      const result = await service.getRevenueTrend(companyId);

      expect(result).toHaveLength(6);
      expect(result.every((point) => point.total === 0)).toBe(true);
      const months = result.map((point) => point.month);
      expect([...months].sort()).toEqual(months);
      expect(months.every((month) => /^\d{4}-\d{2}$/.test(month))).toBe(true);
    });

    it('maps a returned month onto the series and leaves the rest at zero', async () => {
      transactionRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([]),
      );
      const series = await service.getRevenueTrend(companyId);
      const latest = series[series.length - 1].month;

      transactionRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([{ month: latest, total: '112459.50' }]),
      );

      const result = await service.getRevenueTrend(companyId);

      expect(result[result.length - 1]).toEqual({
        month: latest,
        total: 112459.5,
      });
      expect(result[0].total).toBe(0);
    });

    it('honours the requested span', async () => {
      transactionRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([]),
      );

      const result = await service.getRevenueTrend(companyId, 3);

      expect(result).toHaveLength(3);
    });

    it('returns a zero-filled series without querying when the caller has no regions', async () => {
      const result = await service.getRevenueTrend(companyId, 6, undefined, {
        role: 'manager',
        regionCodes: [],
      } as any);

      expect(result).toHaveLength(6);
      expect(result.every((point) => point.total === 0)).toBe(true);
      expect(transactionRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    // Every region zone runs ahead of UTC, so a UTC window drops the newest region month.
    describe('region-anchored window', () => {
      const boundary = new Date('2026-09-30T21:00:00.000Z');

      // The shared anchor is unit-tested in month-series.util.spec; these read it through the series.
      const lastMonthOf = async (regionCode?: string, caller?: any) => {
        jest.useFakeTimers().setSystemTime(boundary);
        transactionRepo.createQueryBuilder.mockReturnValue(
          createMockQueryBuilder([]),
        );
        const result = await service.getRevenueTrend(
          companyId,
          6,
          regionCode,
          caller,
        );
        return result[result.length - 1].month;
      };

      afterEach(() => {
        jest.useRealTimers();
      });

      it('ends on the newest region month when the caller reads every region', async () => {
        expect(boundary.getUTCMonth()).toBe(8);
        expect(await lastMonthOf()).toBe('2026-10');
      });

      it('ends on the requested region month, not the server UTC month', async () => {
        expect(await lastMonthOf('dubai')).toBe('2026-10');
      });

      it('falls back to the UTC month for an unknown region code', async () => {
        expect(await lastMonthOf('nowhere')).toBe('2026-09');
      });

      it('falls back to the UTC month when no region is readable', async () => {
        expect(
          await lastMonthOf(undefined, { role: 'manager', regionCodes: [] }),
        ).toBe('2026-09');
      });

      it('ends the series on the region month so its rows are not zero-filled away', async () => {
        jest.useFakeTimers().setSystemTime(boundary);
        transactionRepo.createQueryBuilder.mockReturnValue(
          createMockQueryBuilder([{ month: '2026-10', total: '5000.00' }]),
        );

        const result = await service.getRevenueTrend(companyId, 6, 'dubai');

        expect(result.map((point) => point.month)).toEqual([
          '2026-05',
          '2026-06',
          '2026-07',
          '2026-08',
          '2026-09',
          '2026-10',
        ]);
        expect(result[result.length - 1]).toEqual({
          month: '2026-10',
          total: 5000,
        });
      });

      it('hands SQL a real first-of-month calendar date', async () => {
        jest.useFakeTimers().setSystemTime(boundary);
        const qb = createMockQueryBuilder([]);
        transactionRepo.createQueryBuilder.mockReturnValue(qb);

        await service.getRevenueTrend(companyId, 6, 'dubai');

        const bound = qb.andWhere.mock.calls.find(([sql]: [string]) =>
          sql.includes('>= :from'),
        );
        expect(bound).toBeDefined();
        const from: string = bound[1].from;
        expect(from).toBe('2026-05-01');
        expect(isDateOnly(from)).toBe(true);
      });
    });
  });
});
