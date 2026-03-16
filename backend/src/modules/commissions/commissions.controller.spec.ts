import { Test, TestingModule } from '@nestjs/testing';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommissionStatus, CommissionType } from './entities/commission.entity';

describe('CommissionsController', () => {
  let controller: CommissionsController;
  let service: jest.Mocked<CommissionsService>;

  const companyId = 'company-uuid-1';
  const agentId = 'agent-uuid-1';
  const mockReq = { user: { companyId, userId: 'user-uuid-1' } };

  const mockCommission = {
    id: 'commission-uuid-1',
    companyId,
    agentId,
    type: CommissionType.SALE,
    status: CommissionStatus.PENDING,
    grossAmount: 500000,
    commissionRate: 2,
    commissionAmount: 10000,
  };

  const paginated = { data: [mockCommission], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommissionsController],
      providers: [
        {
          provide: CommissionsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findByAgent: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            getSummary: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CommissionsController>(CommissionsController);
    service = module.get(CommissionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates commission scoped to company', async () => {
      service.create.mockResolvedValue(mockCommission as any);

      const dto = { agentId, type: CommissionType.SALE, grossAmount: 500000, commissionRate: 2 };
      await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto);
    });
  });

  describe('findAll', () => {
    it('returns paginated commissions', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20, undefined);
    });
  });

  describe('findByAgent', () => {
    it('returns commissions for agent', async () => {
      service.findByAgent.mockResolvedValue(paginated as any);

      await controller.findByAgent(agentId, mockReq, 1, 20);

      expect(service.findByAgent).toHaveBeenCalledWith(agentId, companyId, 1, 20);
    });
  });

  describe('getSummary', () => {
    it('returns summary for agent', async () => {
      const summary = { totalEarned: 18000, totalPaid: 10000, totalPending: 8000, count: 3 };
      service.getSummary.mockResolvedValue(summary);

      const result = await controller.getSummary(agentId, mockReq);

      expect(service.getSummary).toHaveBeenCalledWith(agentId, companyId);
    });
  });

  describe('update', () => {
    it('updates commission status', async () => {
      service.update.mockResolvedValue({ ...mockCommission, status: CommissionStatus.APPROVED } as any);

      await controller.update('commission-uuid-1', { status: CommissionStatus.APPROVED }, mockReq);

      expect(service.update).toHaveBeenCalledWith('commission-uuid-1', companyId, { status: CommissionStatus.APPROVED });
    });
  });
});
