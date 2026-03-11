import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportsService } from './reports.service';
import { Lead, LeadStatus } from '../leads/entities/lead.entity';
import { LeadActivity, ActivityType } from '../leads/entities/lead-activity.entity';
import { Transaction } from '../financial/entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Commission } from '../commissions/entities/commission.entity';
import { Lease } from '../leases/entities/lease.entity';
import { Cheque } from '../cheques/entities/cheque.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';

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
          },
        },
        {
          provide: getRepositoryToken(Cheque),
          useValue: {
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            find: jest.fn(),
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardKpis', () => {
    it('returns correct flat KPIs', async () => {
      leadRepo.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3);

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
      expect(agent1!.conversionRate).toBe(60);
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
          { id: 'l1', firstName: 'Ahmed', lastName: 'Ali', createdAt: hours49Ago },
        ])
        .mockResolvedValueOnce([
          { id: 'l1', firstName: 'Ahmed', lastName: 'Ali', createdAt: hours49Ago },
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
        { id: 'a1', action: 'CREATE', entityType: 'Lead', entityId: 'l1', userId: 'u1', createdAt: new Date() },
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
        { stage: LeadStatus.NEGOTIATING, avgDays: '8.5', count: 3, slowestLeadDays: '14.2' },
        { stage: LeadStatus.CONTACTED, avgDays: '2.1', count: 5, slowestLeadDays: '5.0' },
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
        { agentId: 'agent-1', totalLeadsHandled: 5, avgResponseMinutes: '120.5' },
        { agentId: 'agent-2', totalLeadsHandled: 3, avgResponseMinutes: '45.0' },
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
});
