import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { WorkOrder, WorkOrderStatus, WorkOrderPriority, WorkOrderCategory } from './entities/work-order.entity';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let repo: jest.Mocked<Repository<WorkOrder>>;

  const companyId = 'company-uuid-1';

  const mockOrder: Partial<WorkOrder> = {
    id: 'order-uuid-1',
    companyId,
    unitId: 'unit-uuid-1',
    title: 'Fix AC',
    description: 'AC not cooling properly',
    status: WorkOrderStatus.OPEN,
    priority: WorkOrderPriority.HIGH,
    category: WorkOrderCategory.HVAC,
    completedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        {
          provide: getRepositoryToken(WorkOrder),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    repo = module.get(getRepositoryToken(WorkOrder));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a work order', async () => {
      repo.create.mockReturnValue(mockOrder as WorkOrder);
      repo.save.mockResolvedValue(mockOrder as WorkOrder);

      const dto = { title: 'Fix AC', description: 'AC not cooling', priority: WorkOrderPriority.HIGH, category: WorkOrderCategory.HVAC };
      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(result).toEqual(mockOrder);
    });
  });

  describe('findAll', () => {
    it('returns paginated work orders', async () => {
      repo.findAndCount.mockResolvedValue([[mockOrder as WorkOrder], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns work order when found', async () => {
      repo.findOne.mockResolvedValue(mockOrder as WorkOrder);

      const result = await service.findOne('order-uuid-1', companyId);
      expect(result).toEqual(mockOrder);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('order-uuid-1', 'other-company')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates work order fields', async () => {
      const updated = { ...mockOrder, status: WorkOrderStatus.IN_PROGRESS } as WorkOrder;
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('order-uuid-1', companyId, { status: WorkOrderStatus.IN_PROGRESS });

      expect(result.status).toBe(WorkOrderStatus.IN_PROGRESS);
    });

    it('sets completedAt when status changed to COMPLETED', async () => {
      const openOrder = { ...mockOrder, completedAt: null } as WorkOrder;
      repo.findOne.mockResolvedValue(openOrder);
      repo.save.mockImplementation(async (o) => o as WorkOrder);

      await service.update('order-uuid-1', companyId, { status: WorkOrderStatus.COMPLETED });

      expect(openOrder.completedAt).not.toBeNull();
    });
  });

  describe('remove', () => {
    it('removes work order', async () => {
      repo.findOne.mockResolvedValue(mockOrder as WorkOrder);
      repo.remove.mockResolvedValue(mockOrder as WorkOrder);

      await service.remove('order-uuid-1', companyId);

      expect(repo.remove).toHaveBeenCalledWith(mockOrder);
    });
  });
});
