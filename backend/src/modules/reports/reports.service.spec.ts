import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportsService } from './reports.service';
import { Lead, LeadStatus } from '../leads/entities/lead.entity';
import {
  LeadActivity,
  ActivityType,
} from '../leads/entities/lead-activity.entity';
import { Transaction } from '../financial/entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Commission } from '../commissions/entities/commission.entity';
import { Lease } from '../leases/entities/lease.entity';
import { Cheque } from '../cheques/entities/cheque.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { User } from '../users/entities/user.entity';

function createMockQueryBuilder(result: any = []) {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
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
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            createQueryBuilder: jest.fn(),
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
    userRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([]));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardKpis', () => {
    it('returns correct flat KPIs', async () => {
      leadRepo.count.mockResolvedValueOnce(10).mockResolvedValueOnce(3);

      const txnQb = createMockQueryBuilder({ total: '15000' });
      transactionRepo.createQueryBuilder.mockReturnValue(txnQb);

      unitRepo.count.mockResolvedValue(20);
      leaseRepo.count.mockResolvedValue(5);
      chequeRepo.count.mockResolvedValue(2);

      const result = await service.getDashboardKpis(companyId);

      expect(result.totalLeads).toBe(10);
      expect(result.wonLeads).toBe(3);
      expect(result.totalUnits).toBe(20);
      expect(result.monthlyRevenue).toBe(15000);
      expect(result.activeLeases).toBe(5);
      expect(result.pendingCheques).toBe(2);
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

      unitRepo.find.mockResolvedValue([]);

      const result = await service.getRedFlags(companyId);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].type).toBe('UNTOUCHED_LEAD_48H');
      expect(result[0].severity).toBe('HIGH');
    });
  });

  describe('getActivityFeed', () => {
    it('returns recent activity feed', async () => {
      const mockLogs = [
        {
          id: 'a1',
          action: 'CREATE',
          entityType: 'Lead',
          entityId: 'l1',
          userId: 'u1',
          createdAt: new Date(),
        },
      ];
      auditLogRepo.find.mockResolvedValue(mockLogs);

      const result = await service.getActivityFeed(companyId);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('CREATE');
      expect(auditLogRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId }, take: 25 }),
      );
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

    // Stands in for Postgres on a QueryBuilder read: the seeded rows survive
    // only when the predicate the service built admits their region.
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
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
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

    // Stands in for Postgres on a find/count read: In() carries the admitted
    // regions on `.value`, and a row outside them is not returned.
    function rowsMatchingWhere(rows: any[], where: any) {
      const codes = where?.regionCode?.value as string[] | undefined;
      const byRegion = codes
        ? rows.filter((r) => codes.includes(r.regionCode))
        : rows;
      return where?.status
        ? byRegion.filter((r) => r.status === where.status)
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

        expect(
          result.some((a) => a.agentId === 'agent-punjab'),
        ).toBe(false);
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
      ];
      const unitRows = [
        { id: 'unit-makkah', regionCode: 'makkah' },
        { id: 'unit-punjab', regionCode: 'punjab' },
      ];

      function seed() {
        leadRepo.count.mockImplementation((opts: any) =>
          Promise.resolve(rowsMatchingWhere(leadRows, opts?.where).length),
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

        expect(result.totalLeads).toBe(1);
        expect(result.wonLeads).toBe(1);
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
        expect(result.totalUnits).toBe(0);
      });

      it('leaves KPIs unfiltered for admins', async () => {
        seed();

        const result = await service.getDashboardKpis(
          companyId,
          undefined,
          admin,
        );

        expect(result.totalLeads).toBe(3);
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
          wonLeads: 0,
          totalUnits: 0,
          monthlyRevenue: 0,
          activeLeases: 0,
          pendingCheques: 0,
        });
        expect(leadRepo.count).not.toHaveBeenCalled();
        expect(unitRepo.count).not.toHaveBeenCalled();
        expect(unitRepo.createQueryBuilder).not.toHaveBeenCalled();
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
          regionCode: 'makkah',
          updatedAt: new Date(0),
        },
        {
          id: 'unit-punjab',
          unitNumber: '201',
          regionCode: 'punjab',
          updatedAt: new Date(0),
        },
      ];

      function seed() {
        leadRepo.find.mockImplementation((opts: any) =>
          Promise.resolve(rowsMatchingWhere(staleLeads, opts?.where)),
        );
        leadRepo.createQueryBuilder.mockReturnValue(createRegionAwareQb([]));
        unitRepo.find.mockResolvedValue(vacantUnits);
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
});
