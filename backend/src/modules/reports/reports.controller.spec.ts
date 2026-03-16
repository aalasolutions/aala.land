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
            getRedFlags: jest.fn(),
            getActivityFeed: jest.fn(),
            getPipelineFunnel: jest.fn(),
            getBottlenecks: jest.fn(),
            getResponseTimeMetrics: jest.fn(),
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

      expect(service.getDashboardKpis).toHaveBeenCalledWith(companyId, undefined);
      expect(result).toEqual(mockKpis);
    });
  });

  describe('getAgentPerformance', () => {
    it('returns agent performance for company', async () => {
      const mockPerf = [
        { agentId: 'agent-1', agentName: 'Agent One', leadsAssigned: 5, leadsWon: 3, leadsLost: 1, conversionRate: 60, commissionsEarned: 2000, currency: 'AED' },
      ];
      service.getAgentPerformance.mockResolvedValue(mockPerf as any);

      const result = await controller.getAgentPerformance(mockReq);

      expect(service.getAgentPerformance).toHaveBeenCalledWith(companyId, undefined);
      expect(result).toEqual(mockPerf);
    });
  });

  describe('getRedFlags', () => {
    it('delegates to service with companyId', async () => {
      service.getRedFlags.mockResolvedValue([]);

      const result = await controller.getRedFlags(mockReq);

      expect(service.getRedFlags).toHaveBeenCalledWith(companyId, undefined);
      expect(result).toEqual([]);
    });
  });

  describe('getActivityFeed', () => {
    it('delegates to service with companyId', async () => {
      service.getActivityFeed.mockResolvedValue([]);

      const result = await controller.getActivityFeed(mockReq);

      expect(service.getActivityFeed).toHaveBeenCalledWith(companyId, undefined);
      expect(result).toEqual([]);
    });
  });

  describe('getPipelineFunnel', () => {
    it('delegates to service with companyId', async () => {
      service.getPipelineFunnel.mockResolvedValue([]);

      const result = await controller.getPipelineFunnel(mockReq);

      expect(service.getPipelineFunnel).toHaveBeenCalledWith(companyId, undefined);
      expect(result).toEqual([]);
    });
  });

  describe('getBottlenecks', () => {
    it('returns bottleneck data for company', async () => {
      const mockBottlenecks = [
        { stage: 'NEGOTIATING', avgDays: 8.5, count: 3, slowestLeadDays: 14.2 },
      ];
      service.getBottlenecks.mockResolvedValue(mockBottlenecks);

      const result = await controller.getBottlenecks(mockReq);

      expect(service.getBottlenecks).toHaveBeenCalledWith(companyId, undefined);
      expect(result).toEqual(mockBottlenecks);
    });
  });

  describe('getResponseTimes', () => {
    it('returns response time metrics for company', async () => {
      const mockTimes = [
        { agentId: 'agent-1', avgResponseMinutes: 120.5, totalLeadsHandled: 5 },
      ];
      service.getResponseTimeMetrics.mockResolvedValue(mockTimes);

      const result = await controller.getResponseTimes(mockReq);

      expect(service.getResponseTimeMetrics).toHaveBeenCalledWith(companyId, undefined);
      expect(result).toEqual(mockTimes);
    });
  });
});
