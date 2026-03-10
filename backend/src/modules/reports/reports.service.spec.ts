import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportsService } from './reports.service';
import { Lead, LeadStatus, LeadTemperature, LeadSource } from '../leads/entities/lead.entity';
import { Transaction, TransactionStatus, TransactionType } from '../financial/entities/transaction.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Commission, CommissionStatus, CommissionType } from '../commissions/entities/commission.entity';

describe('ReportsService', () => {
  let service: ReportsService;
  let leadRepo: jest.Mocked<Repository<Lead>>;
  let transactionRepo: jest.Mocked<Repository<Transaction>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;
  let commissionRepo: jest.Mocked<Repository<Commission>>;

  const companyId = 'company-uuid-1';

  const mockLeads: Partial<Lead>[] = [
    { id: 'l1', companyId, status: LeadStatus.WON, assignedTo: 'agent-1', temperature: LeadTemperature.WARM, source: LeadSource.WHATSAPP },
    { id: 'l2', companyId, status: LeadStatus.LOST, assignedTo: 'agent-1', temperature: LeadTemperature.COLD, source: LeadSource.REFERRAL },
    { id: 'l3', companyId, status: LeadStatus.NEW, assignedTo: 'agent-2', temperature: LeadTemperature.HOT, source: LeadSource.WEBSITE },
    { id: 'l4', companyId, status: LeadStatus.NEW, assignedTo: null as any, temperature: LeadTemperature.WARM, source: LeadSource.WALK_IN },
  ];

  const mockTransactions: Partial<Transaction>[] = [
    { id: 't1', companyId, status: TransactionStatus.COMPLETED, amount: 10000, type: TransactionType.INCOME, createdAt: new Date() },
    { id: 't2', companyId, status: TransactionStatus.PENDING, amount: 5000, type: TransactionType.INCOME, createdAt: new Date() },
  ];

  const mockCommissions: Partial<Commission>[] = [
    { id: 'c1', companyId, agentId: 'agent-1', status: CommissionStatus.PAID, commissionAmount: 500, type: CommissionType.SALE },
    { id: 'c2', companyId, agentId: 'agent-1', status: CommissionStatus.PENDING, commissionAmount: 300, type: CommissionType.RENTAL },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(Lead),
          useValue: { count: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: { count: jest.fn() },
        },
        {
          provide: getRepositoryToken(Commission),
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    leadRepo = module.get(getRepositoryToken(Lead));
    transactionRepo = module.get(getRepositoryToken(Transaction));
    unitRepo = module.get(getRepositoryToken(Unit));
    commissionRepo = module.get(getRepositoryToken(Commission));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardKpis', () => {
    it('returns correct flat KPIs', async () => {
      leadRepo.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1);

      transactionRepo.find.mockResolvedValue(mockTransactions as Transaction[]);
      unitRepo.count.mockResolvedValueOnce(10);

      const result = await service.getDashboardKpis(companyId);

      expect(result.totalLeads).toBe(4);
      expect(result.wonLeads).toBe(1);
      expect(result.totalUnits).toBe(10);
      expect(result).toHaveProperty('monthlyRevenue');
      expect(result).toHaveProperty('activeLeases');
      expect(result).toHaveProperty('pendingCheques');
    });
  });

  describe('getAgentPerformance', () => {
    it('aggregates performance per agent', async () => {
      leadRepo.find.mockResolvedValue(mockLeads as Lead[]);
      commissionRepo.find.mockResolvedValue(mockCommissions as Commission[]);

      const result = await service.getAgentPerformance(companyId);

      const agent1 = result.find((a) => a.agentId === 'agent-1');
      expect(agent1).toBeDefined();
      expect(agent1!.leadsAssigned).toBe(2);
      expect(agent1!.leadsWon).toBe(1);
      expect(agent1!.leadsLost).toBe(1);
      expect(agent1!.conversionRate).toBe(50);
      expect(agent1!.commissionsEarned).toBe(800);
    });

    it('includes agents with commissions but no leads', async () => {
      leadRepo.find.mockResolvedValue([]);
      commissionRepo.find.mockResolvedValue([
        { agentId: 'agent-3', commissionAmount: 1000, status: CommissionStatus.PAID, companyId } as Commission,
      ]);

      const result = await service.getAgentPerformance(companyId);

      const agent3 = result.find((a) => a.agentId === 'agent-3');
      expect(agent3).toBeDefined();
      expect(agent3!.commissionsEarned).toBe(1000);
    });
  });
});
