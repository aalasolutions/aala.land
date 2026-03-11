import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkOrderStatus, WorkOrderPriority, WorkOrderCategory, ScheduleFrequency } from './entities/work-order.entity';

describe('MaintenanceController', () => {
  let controller: MaintenanceController;
  let service: jest.Mocked<MaintenanceService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId, userId: 'user-uuid-1' } };

  const mockOrder = {
    id: 'order-uuid-1',
    companyId,
    title: 'Fix AC',
    description: 'AC not cooling',
    status: WorkOrderStatus.OPEN,
    priority: WorkOrderPriority.HIGH,
    category: WorkOrderCategory.HVAC,
  };

  const paginated = { data: [mockOrder], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaintenanceController],
      providers: [
        {
          provide: MaintenanceService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            getCostSummary: jest.fn(),
            getUpcoming: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MaintenanceController>(MaintenanceController);
    service = module.get(MaintenanceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates work order scoped to company', async () => {
      service.create.mockResolvedValue(mockOrder as any);

      const dto = { title: 'Fix AC', description: 'AC not cooling', priority: WorkOrderPriority.HIGH };
      await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, dto);
    });
  });

  describe('findAll', () => {
    it('returns paginated work orders', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, 1, 20);
    });
  });

  describe('getCostSummary', () => {
    it('returns cost summary for company', async () => {
      const summary = { totalEstimated: 15000, totalActual: 12000, variance: 3000, workOrderCount: 5, avgCostPerOrder: 2400 };
      service.getCostSummary.mockResolvedValue(summary);

      const result = await controller.getCostSummary(mockReq);

      expect(service.getCostSummary).toHaveBeenCalledWith(companyId);
      expect(result).toEqual(summary);
    });
  });

  describe('getUpcoming', () => {
    it('returns upcoming preventive work orders', async () => {
      const preventiveOrder = {
        ...mockOrder,
        isPreventive: true,
        scheduleFrequency: ScheduleFrequency.MONTHLY,
        nextScheduledDate: new Date(),
      };
      service.getUpcoming.mockResolvedValue([preventiveOrder] as any);

      const result = await controller.getUpcoming(mockReq);

      expect(service.getUpcoming).toHaveBeenCalledWith(companyId);
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('returns work order by id', async () => {
      service.findOne.mockResolvedValue(mockOrder as any);

      await controller.findOne('order-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('order-uuid-1', companyId);
    });
  });

  describe('update', () => {
    it('updates work order', async () => {
      service.update.mockResolvedValue({ ...mockOrder, status: WorkOrderStatus.COMPLETED } as any);

      await controller.update('order-uuid-1', { status: WorkOrderStatus.COMPLETED }, mockReq);

      expect(service.update).toHaveBeenCalledWith('order-uuid-1', companyId, { status: WorkOrderStatus.COMPLETED });
    });
  });

  describe('remove', () => {
    it('removes work order', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('order-uuid-1', mockReq);

      expect(service.remove).toHaveBeenCalledWith('order-uuid-1', companyId);
    });
  });
});
