import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { Role } from '@shared/enums/roles.enum';

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: jest.Mocked<ReportsService>;

  const companyId = 'company-uuid-1';
  const mockReq = {
    user: {
      companyId,
      userId: 'user-uuid-1',
      email: 'admin@test.com',
      role: 'company_admin',
      regionCodes: ['dubai'],
    },
  };

  const mockKpis = {
    totalLeads: 10,
    openLeads: 6,
    wonLeads: 5,
    totalContacts: 42,
    totalUnits: 20,
    rentalUnits: 8,
    occupiedUnits: 3,
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
            getRevenueTrend: jest.fn(),
            getAgentPerformance: jest.fn(),
            getRedFlags: jest.fn(),
            getActivityFeed: jest.fn(),
            getPipelineFunnel: jest.fn(),
            getLeadOwnership: jest.fn(),
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

      const result = await controller.getDashboard(mockReq, {});

      expect(service.getDashboardKpis).toHaveBeenCalledWith(
        companyId,
        undefined,
        mockReq.user,
      );
      expect(result).toEqual(mockKpis);
    });
  });

  describe('getRevenueTrend', () => {
    it('delegates to service with companyId, a 6-month window and region', async () => {
      const trend = [{ month: '2026-02', revenue: 15000 }];
      service.getRevenueTrend.mockResolvedValue(trend as any);

      const result = await controller.getRevenueTrend(mockReq, {
        regionCode: 'AE',
      });

      expect(service.getRevenueTrend).toHaveBeenCalledWith(
        companyId,
        6,
        'AE',
        mockReq.user,
      );
      expect(result).toEqual(trend);
    });

    it('delegates to service with undefined region when none is given', async () => {
      service.getRevenueTrend.mockResolvedValue([]);

      const result = await controller.getRevenueTrend(mockReq, {});

      expect(service.getRevenueTrend).toHaveBeenCalledWith(
        companyId,
        6,
        undefined,
        mockReq.user,
      );
      expect(result).toEqual([]);
    });
  });

  describe('getAgentPerformance', () => {
    it('returns agent performance for company', async () => {
      const mockPerf = [
        {
          agentId: 'agent-1',
          agentName: 'Agent One',
          leadsAssigned: 5,
          leadsWon: 3,
          leadsLost: 1,
          conversionRate: 75,
          commissionsEarned: 2000,
          currency: 'AED',
        },
      ];
      service.getAgentPerformance.mockResolvedValue(mockPerf as any);

      const result = await controller.getAgentPerformance(mockReq, {});

      expect(service.getAgentPerformance).toHaveBeenCalledWith(
        companyId,
        undefined,
        mockReq.user,
      );
      expect(result).toEqual(mockPerf);
    });
  });

  describe('getRedFlags', () => {
    it('delegates to service with companyId', async () => {
      service.getRedFlags.mockResolvedValue([]);

      const result = await controller.getRedFlags(mockReq, {});

      expect(service.getRedFlags).toHaveBeenCalledWith(
        companyId,
        undefined,
        mockReq.user,
      );
      expect(result).toEqual([]);
    });
  });

  describe('getActivityFeed', () => {
    it('delegates to service with companyId', async () => {
      const page = { data: [], total: 0, page: 2, limit: 10 };
      service.getActivityFeed.mockResolvedValue(page);

      const result = await controller.getActivityFeed(mockReq, {
        page: 2,
        limit: 10,
      });

      expect(service.getActivityFeed).toHaveBeenCalledWith(
        companyId,
        undefined,
        mockReq.user,
        2,
        10,
      );
      expect(result).toEqual(page);
    });
  });

  describe('role access', () => {
    const rolesOf = (handler: (...args: any[]) => unknown) =>
      new Reflector().get<Role[]>(ROLES_KEY, handler);

    it.each([
      ['getAgentPerformance'],
      ['getRedFlags'],
      ['getActivityFeed'],
      ['getPipelineFunnel'],
      ['getAchievements'],
      ['getAgentComparison'],
    ] as const)('limits %s to admins and managers', (name) => {
      expect(rolesOf(ReportsController.prototype[name])).toEqual([
        Role.COMPANY_ADMIN,
        Role.ADMIN,
        Role.MANAGER,
      ]);
    });

    it.each([
      ['getDashboard'],
      ['getRevenueTrend'],
      ['getLeadOwnership'],
    ] as const)(
      'keeps %s open to agents and accountants for the home dashboard',
      (name) => {
        const roles = rolesOf(ReportsController.prototype[name]);
        expect(roles).toContain(Role.AGENT);
        expect(roles).toContain(Role.ACCOUNTANT);
      },
    );
  });

  describe('getPipelineFunnel', () => {
    it('delegates to service with companyId', async () => {
      service.getPipelineFunnel.mockResolvedValue([]);

      const result = await controller.getPipelineFunnel(mockReq, {});

      expect(service.getPipelineFunnel).toHaveBeenCalledWith(
        companyId,
        undefined,
        mockReq.user,
      );
      expect(result).toEqual([]);
    });
  });

  describe('getLeadOwnership', () => {
    it('delegates to service with companyId and region', async () => {
      const payload = {
        agents: [],
        pipeline: [],
        won: 0,
        lost: 0,
        unassignedOpen: 0,
      };
      service.getLeadOwnership.mockResolvedValue(payload);

      const result = await controller.getLeadOwnership(mockReq, {
        regionCode: 'AE',
      });

      expect(service.getLeadOwnership).toHaveBeenCalledWith(
        companyId,
        'AE',
        mockReq.user,
      );
      expect(result).toEqual(payload);
    });
  });

  describe('getBottlenecks', () => {
    it('returns bottleneck data for company', async () => {
      const mockBottlenecks = [
        { stage: 'NEGOTIATING', avgDays: 8.5, count: 3, slowestLeadDays: 14.2 },
      ];
      service.getBottlenecks.mockResolvedValue(mockBottlenecks);

      const result = await controller.getBottlenecks(mockReq, {});

      expect(service.getBottlenecks).toHaveBeenCalledWith(
        companyId,
        undefined,
        mockReq.user,
      );
      expect(result).toEqual(mockBottlenecks);
    });
  });

  describe('getResponseTimes', () => {
    it('returns response time metrics for company', async () => {
      const mockTimes = [
        { agentId: 'agent-1', avgResponseMinutes: 120.5, totalLeadsHandled: 5 },
      ];
      service.getResponseTimeMetrics.mockResolvedValue(mockTimes);

      const result = await controller.getResponseTimes(mockReq, {});

      expect(service.getResponseTimeMetrics).toHaveBeenCalledWith(
        companyId,
        undefined,
        mockReq.user,
      );
      expect(result).toEqual(mockTimes);
    });
  });
});
