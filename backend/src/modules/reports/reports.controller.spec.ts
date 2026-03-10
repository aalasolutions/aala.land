import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: jest.Mocked<ReportsService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId } };

  const mockKpis = {
    totalLeads: 10,
    wonLeads: 5,
    totalUnits: 20,
    monthlyRevenue: 15000,
    activeLeases: 3,
    pendingCheques: 2,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: {
            getDashboardKpis: jest.fn(),
            getAgentPerformance: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportsController>(ReportsController);
    service = module.get(ReportsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboard', () => {
    it('returns dashboard KPIs for company', async () => {
      service.getDashboardKpis.mockResolvedValue(mockKpis);

      const result = await controller.getDashboard(mockReq);

      expect(service.getDashboardKpis).toHaveBeenCalledWith(companyId);
      expect(result).toEqual(mockKpis);
    });
  });

  describe('getAgentPerformance', () => {
    it('returns agent performance for company', async () => {
      const mockPerf = [
        { agentId: 'agent-1', leadsAssigned: 5, leadsWon: 3, leadsLost: 1, conversionRate: 60, commissionsEarned: 2000, currency: 'AED' },
      ];
      service.getAgentPerformance.mockResolvedValue(mockPerf);

      const result = await controller.getAgentPerformance(mockReq);

      expect(service.getAgentPerformance).toHaveBeenCalledWith(companyId);
    });
  });
});
