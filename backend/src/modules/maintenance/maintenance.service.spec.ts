import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { MaintenanceService } from './maintenance.service';
import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderCategory,
  ScheduleFrequency,
} from './entities/work-order.entity';
import { Unit } from '../properties/entities/unit.entity';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let repo: any;
  let unitRepo: any;
  let manager: any;
  let recordHistory: { record: jest.Mock; resolveActorName: jest.Mock };

  const companyId = 'company-uuid-1';

  // How the unit > asset > locality > city chain resolves each unit.
  const unitRegions: Record<string, string> = {
    'unit-uuid-1': 'dubai',
    'unit-makkah': 'makkah',
    'unit-punjab': 'punjab',
  };

  // Stands in for Postgres on the unit region lookup: resolves the region of
  // whichever unit the service asked about.
  const makeUnitRegionBuilder = () => {
    const builder: any = {};
    let unitId: string | undefined;
    builder.innerJoin = jest.fn().mockReturnValue(builder);
    builder.select = jest.fn().mockReturnValue(builder);
    builder.where = jest.fn((_sql: string, params: { unitId: string }) => {
      unitId = params.unitId;
      return builder;
    });
    builder.andWhere = jest.fn().mockReturnValue(builder);
    builder.getRawOne = jest.fn(() =>
      Promise.resolve(
        unitId && unitRegions[unitId]
          ? { regionCode: unitRegions[unitId] }
          : undefined,
      ),
    );
    return builder;
  };

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
    photos: [],
    isPreventive: false,
    scheduleFrequency: null,
    nextScheduledDate: null,
    costNotes: null,
  };

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getManyAndCount: jest.fn(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    manager = {
      getRepository: jest.fn(() => repo),
      // Locked unit reads find a live unit unless a test says otherwise.
      findOne: jest.fn((_entity: unknown, opts: any) =>
        Promise.resolve({ id: opts?.where?.id, deletedAt: null }),
      ),
      remove: jest.fn(),
    };
    recordHistory = {
      record: jest.fn().mockResolvedValue(undefined),
      resolveActorName: jest.fn().mockResolvedValue('Actor Name'),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
          },
        },
        { provide: RecordHistoryService, useValue: recordHistory },
        {
          provide: getRepositoryToken(WorkOrder),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
            query: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    repo = module.get(getRepositoryToken(WorkOrder));
    unitRepo = module.get(getRepositoryToken(Unit));
    unitRepo.createQueryBuilder.mockImplementation(() =>
      makeUnitRegionBuilder(),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a work order', async () => {
      unitRepo.findOne.mockResolvedValue({ id: 'unit-uuid-1', companyId });
      repo.create.mockReturnValue(mockOrder as WorkOrder);
      repo.save.mockResolvedValue(mockOrder as WorkOrder);

      const dto = {
        title: 'Fix AC',
        description: 'AC not cooling',
        priority: WorkOrderPriority.HIGH,
        category: WorkOrderCategory.HVAC,
        unitId: 'unit-uuid-1',
      };
      const result = await service.create(companyId, dto as any);

      expect(unitRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'unit-uuid-1', companyId },
      });
      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        companyId,
        regionCode: 'dubai',
      });
      expect(result).toEqual(mockOrder);
    });

    it('throws BadRequestException when unit belongs to another company', async () => {
      unitRepo.findOne.mockResolvedValue(null);

      const dto = {
        title: 'Fix AC',
        description: 'AC not cooling',
        priority: WorkOrderPriority.HIGH,
        category: WorkOrderCategory.HVAC,
        unitId: 'foreign-unit-uuid',
      };

      await expect(service.create(companyId, dto as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns paginated work orders', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([
        [mockOrder as WorkOrder],
        1,
      ]);
      repo.query.mockResolvedValue([]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('wo');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'wo.company_id = :companyId',
        { companyId },
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'wo.created_at',
        'DESC',
      );
      expect(result.total).toBe(1);
      expect(result.data[0]).toEqual({
        ...mockOrder,
        unitNumber: null,
        assetName: null,
        areaName: null,
      });
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

      await expect(service.findOne('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for wrong company', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('order-uuid-1', 'other-company'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates work order fields', async () => {
      const updated = {
        ...mockOrder,
        status: WorkOrderStatus.IN_PROGRESS,
      } as WorkOrder;
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);
      repo.save.mockResolvedValue(updated);

      const result = await service.update('order-uuid-1', companyId, {
        status: WorkOrderStatus.IN_PROGRESS,
      });

      expect(result.status).toBe(WorkOrderStatus.IN_PROGRESS);
    });

    it('throws BadRequestException when reassigned unit belongs to another company', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);
      unitRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('order-uuid-1', companyId, {
          unitId: 'foreign-unit-uuid',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when unitId is cleared to null', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);

      await expect(
        service.update('order-uuid-1', companyId, {
          unitId: null,
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(unitRepo.findOne).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('sets completedAt when status changed to COMPLETED', async () => {
      const openOrder = { ...mockOrder, completedAt: null } as WorkOrder;
      repo.findOne.mockResolvedValue(openOrder);
      repo.save.mockImplementation(async (o) => o as WorkOrder);

      await service.update('order-uuid-1', companyId, {
        status: WorkOrderStatus.COMPLETED,
      });

      expect(openOrder.completedAt).not.toBeNull();
    });

    it('refuses to save a work order deleted after the first read', async () => {
      repo.findOne
        .mockResolvedValueOnce({ ...mockOrder } as WorkOrder)
        .mockResolvedValueOnce(null);

      await expect(
        service.update('order-uuid-1', companyId, { notes: 'Checked' }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.findOne).toHaveBeenLastCalledWith({
        where: { id: 'order-uuid-1', companyId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const lockRow = (overrides: Partial<WorkOrder> = {}) => {
      const row = {
        ...mockOrder,
        vendorId: null,
        actualCost: null,
        regionCode: 'dubai',
        ...overrides,
      } as WorkOrder;
      repo.findOne.mockResolvedValue(row);
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === WorkOrder
            ? row
            : { id: 'unit-uuid-1', unitNumber: 'A-1204' },
        ),
      );
      return row;
    };

    const expectRefused = async () => {
      await expect(
        service.remove('order-uuid-1', companyId, 'Wrong entry', 'user-1'),
      ).rejects.toThrow(
        new ConflictException('Cancel this work order instead.'),
      );
      expect(recordHistory.record).not.toHaveBeenCalled();
      expect(manager.remove).not.toHaveBeenCalled();
    };

    it('deletes an OPEN order with no vendor and no cost, recording DELETE first', async () => {
      const row = lockRow();

      await service.remove('order-uuid-1', companyId, 'Duplicate', 'user-1');

      expect(manager.findOne).toHaveBeenCalledWith(WorkOrder, {
        where: { id: 'order-uuid-1', companyId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          companyId,
          action: RecordHistoryAction.DELETE,
          entityType: 'WorkOrder',
          entityId: 'order-uuid-1',
          entityTitle: 'Fix AC',
          contextTitle: 'Unit A-1204',
          reason: 'Duplicate',
          actorId: 'user-1',
          actorName: 'Actor Name',
          regionCode: 'dubai',
        }),
      );
      expect(manager.remove).toHaveBeenCalledWith(row);
      expect(recordHistory.record.mock.invocationCallOrder[0]).toBeLessThan(
        manager.remove.mock.invocationCallOrder[0],
      );
    });

    it('treats a zero actual cost as no cost', async () => {
      lockRow({ actualCost: '0.00' as unknown as number });

      await service.remove('order-uuid-1', companyId, 'Duplicate', 'user-1');

      expect(manager.remove).toHaveBeenCalled();
    });

    it.each([
      WorkOrderStatus.IN_PROGRESS,
      WorkOrderStatus.PENDING_APPROVAL,
      WorkOrderStatus.COMPLETED,
      WorkOrderStatus.CANCELLED,
    ])('refuses a %s order with 409', async (status: WorkOrderStatus) => {
      lockRow({ status });
      await expectRefused();
    });

    it('refuses an order with a vendor', async () => {
      lockRow({ vendorId: 'vendor-uuid-1' });
      await expectRefused();
    });

    it('refuses an order with an actual cost', async () => {
      lockRow({ actualCost: '150.00' as unknown as number });
      await expectRefused();
    });
  });

  describe('status history', () => {
    it('rejects cancelling without a reason before saving', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);

      await expect(
        service.update('order-uuid-1', companyId, {
          status: WorkOrderStatus.CANCELLED,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('order-uuid-1', companyId, {
          status: WorkOrderStatus.CANCELLED,
          reason: '  ',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(recordHistory.record).not.toHaveBeenCalled();
    });

    it('records CANCEL with the reason in the save transaction', async () => {
      repo.findOne.mockResolvedValue({
        ...mockOrder,
        regionCode: 'dubai',
      } as WorkOrder);
      repo.save.mockImplementation(async (o: WorkOrder) => o);
      manager.findOne.mockResolvedValue({
        id: 'unit-uuid-1',
        unitNumber: 'A-1204',
      });

      await service.update(
        'order-uuid-1',
        companyId,
        { status: WorkOrderStatus.CANCELLED, reason: 'Tenant fixed it' },
        undefined,
        'user-1',
      );

      expect(manager.getRepository).toHaveBeenCalledWith(WorkOrder);
      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          companyId,
          action: RecordHistoryAction.CANCEL,
          entityType: 'WorkOrder',
          entityId: 'order-uuid-1',
          entityTitle: 'Fix AC',
          contextTitle: 'Unit A-1204',
          reason: 'Tenant fixed it',
          actorId: 'user-1',
          actorName: 'Actor Name',
          metadata: {
            from: WorkOrderStatus.OPEN,
            to: WorkOrderStatus.CANCELLED,
          },
        }),
      );
    });

    it('records STATUS_CHANGE for other status moves', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);
      repo.save.mockImplementation(async (o: WorkOrder) => o);

      await service.update(
        'order-uuid-1',
        companyId,
        { status: WorkOrderStatus.IN_PROGRESS },
        undefined,
        'user-1',
      );

      expect(recordHistory.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: RecordHistoryAction.STATUS_CHANGE,
          reason: null,
          metadata: {
            from: WorkOrderStatus.OPEN,
            to: WorkOrderStatus.IN_PROGRESS,
          },
        }),
      );
    });

    it('records nothing when the status is unchanged', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);
      repo.save.mockImplementation(async (o: WorkOrder) => o);

      await service.update(
        'order-uuid-1',
        companyId,
        { title: 'Fix AC now', status: WorkOrderStatus.OPEN },
        undefined,
        'user-1',
      );

      expect(repo.save).toHaveBeenCalled();
      expect(recordHistory.record).not.toHaveBeenCalled();
    });
  });

  describe('archived unit', () => {
    const archivedUnit = (id: string) => ({
      id,
      companyId,
      deletedAt: new Date(),
    });

    it('refuses creating a work order on an archived unit', async () => {
      unitRepo.findOne.mockResolvedValue(archivedUnit('unit-uuid-1'));

      await expect(
        service.create(companyId, {
          title: 'Fix AC',
          description: 'AC not cooling',
          unitId: 'unit-uuid-1',
        } as any),
      ).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses moving a work order onto an archived unit', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);
      unitRepo.findOne.mockResolvedValue(archivedUnit('unit-makkah'));

      await expect(
        service.update('order-uuid-1', companyId, { unitId: 'unit-makkah' }),
      ).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses editing a work order already on an archived unit', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);
      unitRepo.findOne.mockResolvedValue(archivedUnit('unit-uuid-1'));
      manager.findOne.mockResolvedValue(archivedUnit('unit-uuid-1'));

      await expect(
        service.update('order-uuid-1', companyId, {
          unitId: 'unit-uuid-1',
          notes: 'Checked',
        }),
      ).rejects.toThrow(
        'This unit is archived. Its records can no longer be edited.',
      );
      expect(manager.findOne).toHaveBeenCalledWith(Unit, {
        where: { id: 'unit-uuid-1', companyId },
        select: { id: true, deletedAt: true },
        lock: { mode: 'pessimistic_read' },
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    const shareLock = (id: string) => ({
      where: { id, companyId },
      select: { id: true, deletedAt: true },
      lock: { mode: 'pessimistic_read' },
    });

    it('refuses create when the unit is archived after the first read', async () => {
      unitRepo.findOne.mockResolvedValue({ id: 'unit-uuid-1', companyId });
      repo.create.mockReturnValue(mockOrder as WorkOrder);
      manager.findOne.mockResolvedValue(archivedUnit('unit-uuid-1'));

      await expect(
        service.create(companyId, {
          title: 'Fix AC',
          description: 'AC not cooling',
          unitId: 'unit-uuid-1',
        } as any),
      ).rejects.toThrow('This unit is archived.');
      expect(manager.findOne).toHaveBeenCalledWith(
        Unit,
        shareLock('unit-uuid-1'),
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses create when the unit is deleted while waiting for the lock', async () => {
      unitRepo.findOne.mockResolvedValue({ id: 'unit-uuid-1', companyId });
      repo.create.mockReturnValue(mockOrder as WorkOrder);
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.create(companyId, {
          title: 'Fix AC',
          description: 'AC not cooling',
          unitId: 'unit-uuid-1',
        } as any),
      ).rejects.toThrow(new BadRequestException('Invalid unit selected'));
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses moving a work order onto a unit archived after the first read', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);
      unitRepo.findOne.mockResolvedValue({ id: 'unit-makkah', companyId });
      manager.findOne.mockImplementation((_entity: unknown, opts: any) =>
        Promise.resolve(
          opts.where.id === 'unit-makkah'
            ? archivedUnit('unit-makkah')
            : { id: opts.where.id, deletedAt: null },
        ),
      );

      await expect(
        service.update('order-uuid-1', companyId, { unitId: 'unit-makkah' }),
      ).rejects.toThrow('This unit is archived.');
      expect(manager.findOne).toHaveBeenCalledWith(
        Unit,
        shareLock('unit-makkah'),
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses a status change on a work order whose unit is archived', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder } as WorkOrder);
      manager.findOne.mockResolvedValue(archivedUnit('unit-uuid-1'));

      await expect(
        service.update('order-uuid-1', companyId, {
          status: WorkOrderStatus.COMPLETED,
        }),
      ).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(recordHistory.record).not.toHaveBeenCalled();
    });
  });

  describe('getCostSummary', () => {
    it('returns cost summary with SQL aggregation', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalEstimated: '15000.00',
        totalActual: '12000.00',
        workOrderCount: '5',
      });

      const result = await service.getCostSummary(companyId);

      expect(result.totalEstimated).toBe(15000);
      expect(result.totalActual).toBe(12000);
      expect(result.variance).toBe(3000);
      expect(result.workOrderCount).toBe(5);
      expect(result.avgCostPerOrder).toBe(2400);
    });

    it('returns zero averages when no work orders exist', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        totalEstimated: '0',
        totalActual: '0',
        workOrderCount: '0',
      });

      const result = await service.getCostSummary(companyId);

      expect(result.avgCostPerOrder).toBe(0);
      expect(result.workOrderCount).toBe(0);
    });
  });

  describe('getUpcoming', () => {
    it('returns preventive work orders due in next 30 days', async () => {
      const preventiveOrder = {
        ...mockOrder,
        isPreventive: true,
        scheduleFrequency: ScheduleFrequency.MONTHLY,
        nextScheduledDate: new Date(),
      };
      mockQueryBuilder.getMany.mockResolvedValue([preventiveOrder]);

      const result = await service.getUpcoming(companyId);

      expect(result).toHaveLength(1);
      expect(repo.createQueryBuilder).toHaveBeenCalledWith('wo');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'wo.company_id = :companyId',
        { companyId },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'wo.is_preventive = true',
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'wo.next_scheduled_date',
        'ASC',
      );
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(100);
    });

    it('returns empty array when no preventive orders exist', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.getUpcoming(companyId);

      expect(result).toHaveLength(0);
    });
  });
  describe('region scoping', () => {
    const makkahManager = { role: 'manager', regionCodes: ['makkah'] };
    const twoRegionManager = {
      role: 'manager',
      regionCodes: ['makkah', 'punjab'],
    };
    const admin = { role: 'company_admin', regionCodes: ['makkah'] };

    // Stands in for Postgres on the by-id read: the seeded work order resolves
    // only when the region predicate the service built admits its region_code.
    function seedOrder(regionCode: string, unitId: string | null = null) {
      const row = { ...mockOrder, regionCode, unitId } as WorkOrder;
      repo.findOne.mockImplementation((opts: any) => {
        const codes = opts?.where?.regionCode?.value as string[] | undefined;
        if (codes && !codes.includes(regionCode)) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      });
      return row;
    }

    it('denies findOne on a work order outside the caller assigned regions', async () => {
      seedOrder('punjab', 'unit-punjab');

      await expect(
        service.findOne('order-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows a by-id read in any region the caller is assigned to', async () => {
      seedOrder('punjab', 'unit-punjab');

      const result = await service.findOne(
        'order-uuid-1',
        companyId,
        twoRegionManager,
      );

      expect(result.id).toBe('order-uuid-1');
    });

    it('reads a work order with no unit from the caller own region', async () => {
      seedOrder('makkah');

      const result = await service.findOne(
        'order-uuid-1',
        companyId,
        makkahManager,
      );

      expect(result.unitId).toBeNull();
      expect(result.regionCode).toBe('makkah');
    });

    it('denies a work order with no unit from another region', async () => {
      seedOrder('punjab');

      await expect(
        service.findOne('order-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
    });

    it('reads the region off the work order own column, not its unit', async () => {
      seedOrder('punjab', 'unit-punjab');

      await expect(
        service.findOne('order-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);

      const where = repo.findOne.mock.calls[0][0].where;
      expect(where.regionCode.value).toEqual(['makkah']);
      expect(where.unitId).toBeUndefined();
    });

    it('denies update on a work order outside the caller assigned regions', async () => {
      seedOrder('punjab', 'unit-punjab');

      await expect(
        service.update(
          'order-uuid-1',
          companyId,
          { status: WorkOrderStatus.COMPLETED },
          makkahManager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('denies remove on a work order outside the caller assigned regions', async () => {
      const row = seedOrder('punjab', 'unit-punjab');
      // remove() locks via manager.findOne, so the region filter is asserted there.
      manager.findOne.mockImplementation((entity: unknown, opts: any) => {
        if (entity !== WorkOrder) {
          return Promise.resolve({ id: opts?.where?.id, deletedAt: null });
        }
        const codes = opts?.where?.regionCode?.value as string[] | undefined;
        if (codes && !codes.includes('punjab')) {
          return Promise.resolve(null);
        }
        return Promise.resolve(row);
      });

      await expect(
        service.remove(
          'order-uuid-1',
          companyId,
          'Wrong entry',
          'user-uuid-1',
          makkahManager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(manager.remove).not.toHaveBeenCalled();
    });

    it('denies every by-id read when the caller has no assigned region', async () => {
      seedOrder('makkah', 'unit-makkah');

      await expect(
        service.findOne('order-uuid-1', companyId, {
          role: 'manager',
          regionCodes: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('leaves admins unconfined by their own assignments', async () => {
      seedOrder('punjab', 'unit-punjab');

      const result = await service.findOne('order-uuid-1', companyId, admin);

      expect(result.id).toBe('order-uuid-1');
    });

    it('stays unscoped when no caller is supplied', async () => {
      seedOrder('punjab', 'unit-punjab');

      const result = await service.findOne('order-uuid-1', companyId);

      expect(result.id).toBe('order-uuid-1');
    });

    // Stands in for Postgres on the unit lookup: the unit resolves only when
    // the region predicate the service built admits its region.
    function seedUnitLookup() {
      unitRepo.findOne.mockImplementation((opts: any) => {
        const id = opts?.where?.id as string;
        const codes = opts?.where?.asset?.locality?.city?.regionCode?.value as
          | string[]
          | undefined;
        const region = unitRegions[id];
        if (!region || (codes && !codes.includes(region))) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ id });
      });
    }

    // Stands in for Postgres on the list and aggregate reads: the seeded work
    // orders survive only when the region predicate admits their region_code.
    function seedOrders(
      seeds: Array<{ id: string; regionCode: string; unitId: string | null }>,
    ) {
      const rows = seeds.map((seed) => ({ ...mockOrder, ...seed }) as WorkOrder);
      let codes: string[] | undefined;
      const matched = () =>
        codes ? rows.filter((row) => codes!.includes(row.regionCode)) : rows;
      const chain: any = {};
      ['select', 'addSelect', 'where', 'skip', 'take', 'orderBy'].forEach(
        (key) => {
          chain[key] = jest.fn().mockReturnValue(chain);
        },
      );
      chain.andWhere = jest
        .fn()
        .mockImplementation((_sql: string, params?: any) => {
          if (params?.regionCodes) {
            codes = params.regionCodes as string[];
          }
          return chain;
        });
      chain.getManyAndCount = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve([matched(), matched().length]),
        );
      chain.getMany = jest
        .fn()
        .mockImplementation(() => Promise.resolve(matched()));
      chain.getRawOne = jest.fn().mockImplementation(() =>
        Promise.resolve({
          totalEstimated: String(matched().length * 100),
          totalActual: String(matched().length * 60),
          workOrderCount: String(matched().length),
        }),
      );
      repo.createQueryBuilder.mockReturnValue(chain);
      repo.query.mockResolvedValue([]);
      return rows;
    }

    // A work order with no unit is the case the column exists for: under the
    // unit chain filter it matched no region at all.
    const listSeeds = [
      { id: 'order-makkah', regionCode: 'makkah', unitId: 'unit-makkah' },
      { id: 'order-makkah-no-unit', regionCode: 'makkah', unitId: null },
      { id: 'order-punjab', regionCode: 'punjab', unitId: 'unit-punjab' },
    ];

    it('confines the list to the caller assigned regions', async () => {
      seedOrders(listSeeds);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        makkahManager,
      );

      expect(result.data.map((o) => o.id)).toEqual([
        'order-makkah',
        'order-makkah-no-unit',
      ]);
      expect(result.total).toBe(2);
    });

    it('lists a work order with no unit to a caller in that region', async () => {
      seedOrders(listSeeds);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        makkahManager,
      );

      const unitless = result.data.find((o) => o.unitId === null);
      expect(unitless?.id).toBe('order-makkah-no-unit');
    });

    it('hides a work order with no unit from a caller in another region', async () => {
      seedOrders([
        { id: 'order-punjab-no-unit', regionCode: 'punjab', unitId: null },
      ]);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        makkahManager,
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('filters the list on the work order own region column', async () => {
      seedOrders(listSeeds);

      await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        makkahManager,
      );

      const chain = repo.createQueryBuilder.mock.results[0].value;
      expect(chain.andWhere).toHaveBeenCalledWith(
        'wo.region_code IN (:...regionCodes)',
        { regionCodes: ['makkah'] },
      );
    });

    it('lists no work orders from a region outside the caller assignments', async () => {
      seedOrders(listSeeds);

      const result = await service.findAll(
        companyId,
        1,
        20,
        'punjab',
        undefined,
        undefined,
        makkahManager,
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('leaves the list unfiltered for admins', async () => {
      seedOrders(listSeeds);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        admin,
      );

      expect(result.data.map((o) => o.id)).toEqual([
        'order-makkah',
        'order-makkah-no-unit',
        'order-punjab',
      ]);
    });

    it('lists nothing when the caller has no assigned region', async () => {
      seedOrders(listSeeds);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        { role: 'manager', regionCodes: [] },
      );

      expect(result.data).toEqual([]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('totals costs only for the caller assigned regions', async () => {
      seedOrders(listSeeds);

      const result = await service.getCostSummary(
        companyId,
        undefined,
        makkahManager,
      );

      expect(result.workOrderCount).toBe(2);
      expect(result.totalEstimated).toBe(200);
    });

    it('totals costs across every region for admins', async () => {
      seedOrders(listSeeds);

      const result = await service.getCostSummary(companyId, undefined, admin);

      expect(result.workOrderCount).toBe(3);
    });

    it('totals no costs when the caller has no assigned region', async () => {
      seedOrders(listSeeds);

      const result = await service.getCostSummary(companyId, undefined, {
        role: 'manager',
        regionCodes: [],
      });

      expect(result).toEqual({
        totalEstimated: 0,
        totalActual: 0,
        variance: 0,
        workOrderCount: 0,
        avgCostPerOrder: 0,
      });
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('confines upcoming preventive work to the caller assigned regions', async () => {
      seedOrders(listSeeds);

      const result = await service.getUpcoming(
        companyId,
        undefined,
        makkahManager,
      );

      expect(result.map((o) => o.id)).toEqual([
        'order-makkah',
        'order-makkah-no-unit',
      ]);
    });

    it('returns no upcoming preventive work when the caller has no assigned region', async () => {
      seedOrders(listSeeds);

      const result = await service.getUpcoming(companyId, undefined, {
        role: 'manager',
        regionCodes: [],
      });

      expect(result).toEqual([]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    describe('unit binding', () => {
      const dtoOnUnit = (unitId: string) =>
        ({
          title: 'Fix AC',
          description: 'AC not cooling',
          priority: WorkOrderPriority.HIGH,
          category: WorkOrderCategory.HVAC,
          unitId,
        }) as any;

      // Writes the row the service built, so the stamped region is observable.
      function seedPassthroughWrites() {
        repo.create.mockImplementation((input: Partial<WorkOrder>) => input);
        repo.save.mockImplementation((row: WorkOrder) => Promise.resolve(row));
      }

      it('denies create when the unit is outside the caller regions', async () => {
        seedUnitLookup();

        await expect(
          service.create(companyId, dtoOnUnit('unit-punjab'), makkahManager),
        ).rejects.toThrow(BadRequestException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('creates a work order on a unit inside the caller regions', async () => {
        seedUnitLookup();
        seedPassthroughWrites();

        const result = await service.create(
          companyId,
          dtoOnUnit('unit-punjab'),
          twoRegionManager,
        );

        expect(result.unitId).toBe('unit-punjab');
        expect(result.regionCode).toBe('punjab');
      });

      it('denies create when the caller has no assigned region', async () => {
        seedUnitLookup();

        await expect(
          service.create(companyId, dtoOnUnit('unit-makkah'), {
            role: 'manager',
            regionCodes: [],
          }),
        ).rejects.toThrow(BadRequestException);
        expect(unitRepo.findOne).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('denies moving a work order onto a unit outside the caller regions', async () => {
        seedOrder('makkah', 'unit-makkah');
        seedUnitLookup();

        await expect(
          service.update(
            'order-uuid-1',
            companyId,
            { unitId: 'unit-punjab' },
            makkahManager,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('moves a work order onto a unit inside the caller regions', async () => {
        seedOrder('makkah', 'unit-makkah');
        seedUnitLookup();
        seedPassthroughWrites();

        const result = await service.update(
          'order-uuid-1',
          companyId,
          { unitId: 'unit-punjab' },
          twoRegionManager,
        );

        expect(result.unitId).toBe('unit-punjab');
      });

      it('moves the region with the unit', async () => {
        seedOrder('makkah', 'unit-makkah');
        seedUnitLookup();
        seedPassthroughWrites();

        const result = await service.update(
          'order-uuid-1',
          companyId,
          { unitId: 'unit-punjab' },
          twoRegionManager,
        );

        expect(result.regionCode).toBe('punjab');
      });
    });
  });
});
