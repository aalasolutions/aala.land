import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { LeasesService } from './leases.service';
import { Lease, LeaseStatus, LeaseType } from './entities/lease.entity';

describe('LeasesService', () => {
  let service: LeasesService;
  let repo: jest.Mocked<Repository<Lease>>;
  let dataSource: { transaction: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  // The count re-check inside the locked transaction resolves through this.
  let activeLeaseCount: number;

  const companyId = 'company-uuid-1';

  // Build a QueryFailedError shaped like a Postgres unique-index violation, with
  // an optional driver `code`/`constraint` and message so the service's 23505
  // mapping can be exercised.
  const makeUniqueViolation = (
    driverError: { code?: string; constraint?: string; detail?: string },
    message = 'duplicate key value violates unique constraint',
  ): QueryFailedError => {
    const err = new QueryFailedError(
      'save',
      [],
      driverError as unknown as Error,
    );
    (err as unknown as { driverError: unknown }).driverError = driverError;
    Object.defineProperty(err, 'message', {
      value: message,
      configurable: true,
    });
    return err;
  };

  const mockLease: Partial<Lease> = {
    id: 'lease-uuid-1',
    companyId,
    unitId: 'unit-uuid-1',
    tenantName: 'Ahmed Al-Rashid',
    tenantEmail: 'ahmed@example.com',
    type: LeaseType.RESIDENTIAL,
    status: LeaseStatus.ACTIVE,
    monthlyRent: 5000,
    currency: 'AED',
    numberOfCheques: 4,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
  };

  beforeEach(async () => {
    activeLeaseCount = 0;

    // A QueryBuilder chain whose getCount() reports how many OTHER active leases
    // exist on the unit. Used by assertNoOtherActiveLease.
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockImplementation(async () => activeLeaseCount),
    };

    manager = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    // transaction(fn) runs the callback with the mocked EntityManager, mirroring
    // a real committed transaction.
    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((fn: (m: EntityManager) => unknown) =>
          fn(manager as unknown as EntityManager),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeasesService,
        {
          provide: getRepositoryToken(Lease),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<LeasesService>(LeasesService);
    repo = module.get(getRepositoryToken(Lease));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a lease', async () => {
      repo.create.mockReturnValue(mockLease as Lease);
      repo.save.mockResolvedValue(mockLease as Lease);

      const dto = {
        unitId: 'unit-uuid-1',
        tenantName: 'Ahmed Al-Rashid',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 5000,
      };
      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(result).toEqual(mockLease);
    });
  });

  describe('findAll', () => {
    it('returns paginated leases', async () => {
      repo.findAndCount.mockResolvedValue([[mockLease as Lease], 1]);

      const result = await service.findAll(companyId, 1, 20);

      expect(repo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.total).toBe(1);
      expect(result.data).toEqual([mockLease]);
    });
  });

  describe('findOne', () => {
    it('returns lease when found', async () => {
      repo.findOne.mockResolvedValue(mockLease as Lease);

      const result = await service.findOne('lease-uuid-1', companyId);
      expect(result).toEqual(mockLease);
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
        service.findOne('lease-uuid-1', 'other-company'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUnit', () => {
    it('returns leases for unit', async () => {
      repo.find.mockResolvedValue([mockLease as Lease]);

      const result = await service.findByUnit('unit-uuid-1', companyId);

      expect(repo.find).toHaveBeenCalledWith({
        where: { unitId: 'unit-uuid-1', companyId },
        order: { startDate: 'DESC' },
      });
      expect(result).toEqual([mockLease]);
    });
  });

  describe('update', () => {
    it('updates lease fields inside a locked transaction', async () => {
      manager.findOne.mockResolvedValue({ ...mockLease } as Lease);
      manager.save.mockImplementation(async (_e: unknown, l: Lease) => l);

      const result = await service.update('lease-uuid-1', companyId, {
        status: LeaseStatus.EXPIRED,
      });

      // The row is loaded FOR UPDATE, not through the plain repository.
      expect(manager.findOne).toHaveBeenCalledWith(Lease, {
        where: { id: 'lease-uuid-1', companyId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(LeaseStatus.EXPIRED);
    });

    it('throws NotFoundException when lease not found', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.update('bad-id', companyId, { status: LeaseStatus.EXPIRED }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects flipping a lease to ACTIVE when the unit already has one', async () => {
      manager.findOne.mockResolvedValue({
        ...mockLease,
        status: LeaseStatus.DRAFT,
      } as Lease);
      activeLeaseCount = 1; // another ACTIVE lease already exists on the unit

      await expect(
        service.update('lease-uuid-1', companyId, {
          status: LeaseStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('maps the active-lease unique-index violation to a 400 when flipping to ACTIVE', async () => {
      // The count guard passes (no committed ACTIVE lease seen) but the racing
      // concurrent transition already committed, so the save trips
      // UQ_leases_active_unit with a raw 23505.
      manager.findOne.mockResolvedValue({
        ...mockLease,
        status: LeaseStatus.DRAFT,
      } as Lease);
      activeLeaseCount = 0;
      manager.save.mockRejectedValue(
        makeUniqueViolation({
          code: '23505',
          constraint: 'UQ_leases_active_unit',
        }),
      );

      await expect(
        service.update('lease-uuid-1', companyId, {
          status: LeaseStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rethrows a non-active-lease unique violation on flip to ACTIVE', async () => {
      manager.findOne.mockResolvedValue({
        ...mockLease,
        status: LeaseStatus.DRAFT,
      } as Lease);
      activeLeaseCount = 0;
      const other = makeUniqueViolation({
        code: '23505',
        constraint: 'some_other_index',
      });
      manager.save.mockRejectedValue(other);

      await expect(
        service.update('lease-uuid-1', companyId, {
          status: LeaseStatus.ACTIVE,
        }),
      ).rejects.toBe(other);
    });
  });

  describe('renew', () => {
    it('locks the lease, marks it RENEWED, and creates a new lease', async () => {
      const activeLease = { ...mockLease, status: LeaseStatus.ACTIVE } as Lease;
      const newLeaseData = {
        unitId: 'unit-uuid-1',
        tenantName: 'Ahmed Al-Rashid',
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        monthlyRent: 5500,
      };
      // Successor defaults to DRAFT (CreateLeaseDto carries no status).
      const newLeaseEntity = {
        ...newLeaseData,
        companyId,
        status: LeaseStatus.DRAFT,
      } as unknown as Lease;
      const savedNewLease = { ...newLeaseEntity, id: 'lease-uuid-2' } as Lease;

      manager.findOne.mockResolvedValue(activeLease);
      manager.create.mockReturnValue(newLeaseEntity);
      manager.save
        .mockResolvedValueOnce({
          ...activeLease,
          status: LeaseStatus.RENEWED,
        } as Lease)
        .mockResolvedValueOnce(savedNewLease);

      const result = await service.renew(
        'lease-uuid-1',
        companyId,
        newLeaseData as any,
      );

      // Old lease loaded FOR UPDATE, re-checked under the lock.
      expect(manager.findOne).toHaveBeenCalledWith(Lease, {
        where: { id: 'lease-uuid-1', companyId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.oldLease.status).toBe(LeaseStatus.RENEWED);
      expect(result.newLease).toEqual(savedNewLease);
    });

    it('allows renewal of EXPIRED lease', async () => {
      const expiredLease = {
        ...mockLease,
        status: LeaseStatus.EXPIRED,
      } as Lease;
      const newLeaseData = {
        unitId: 'unit-uuid-1',
        tenantName: 'Ahmed Al-Rashid',
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        monthlyRent: 5500,
      };
      const newLeaseEntity = {
        ...newLeaseData,
        companyId,
        status: LeaseStatus.DRAFT,
      } as unknown as Lease;

      manager.findOne.mockResolvedValue(expiredLease);
      manager.create.mockReturnValue(newLeaseEntity);
      manager.save
        .mockResolvedValueOnce({
          ...expiredLease,
          status: LeaseStatus.RENEWED,
        } as Lease)
        .mockResolvedValueOnce({
          ...newLeaseEntity,
          id: 'lease-uuid-2',
        } as Lease);

      const result = await service.renew(
        'lease-uuid-1',
        companyId,
        newLeaseData as any,
      );

      expect(result.oldLease.status).toBe(LeaseStatus.RENEWED);
    });

    it('rejects the second concurrent renew: status already RENEWED under the lock', async () => {
      // Simulates the losing renew re-reading the row AFTER the winner committed:
      // the FOR UPDATE load returns a RENEWED lease, so the guard rejects it and
      // no second successor is created.
      const renewedLease = {
        ...mockLease,
        status: LeaseStatus.RENEWED,
      } as Lease;
      manager.findOne.mockResolvedValue(renewedLease);

      await expect(
        service.renew('lease-uuid-1', companyId, {} as any),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('maps the successor unique-index violation to a 400 (two renews, same unit, different old leases)', async () => {
      // Both renews lock their own (different) old-lease rows, so neither sees the
      // other's uncommitted ACTIVE successor and both pass assertNoOtherActiveLease.
      // The losing successor save then trips UQ_leases_active_unit; that raw 23505
      // must surface as a 400, not a 500.
      const activeLease = { ...mockLease, status: LeaseStatus.ACTIVE } as Lease;
      const activeSuccessor = {
        unitId: 'unit-uuid-1',
        companyId,
        status: LeaseStatus.ACTIVE,
      } as unknown as Lease;

      manager.findOne.mockResolvedValue(activeLease);
      manager.create.mockReturnValue(activeSuccessor);
      activeLeaseCount = 0; // guard passes; the DB backstop is what fires
      manager.save
        .mockResolvedValueOnce({
          ...activeLease,
          status: LeaseStatus.RENEWED,
        } as Lease)
        .mockRejectedValueOnce(
          makeUniqueViolation({
            code: '23505',
            constraint: 'UQ_leases_active_unit',
          }),
        );

      await expect(
        service.renew('lease-uuid-1', companyId, {
          status: LeaseStatus.ACTIVE,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps the successor unique violation reported via detail (index in detail, no constraint field)', async () => {
      // Postgres reports a standalone unique-index violation with the index name in
      // `detail` and may leave `constraint` empty; the mapping must still catch it.
      const activeLease = { ...mockLease, status: LeaseStatus.ACTIVE } as Lease;
      const activeSuccessor = {
        unitId: 'unit-uuid-1',
        companyId,
        status: LeaseStatus.ACTIVE,
      } as unknown as Lease;

      manager.findOne.mockResolvedValue(activeLease);
      manager.create.mockReturnValue(activeSuccessor);
      activeLeaseCount = 0;
      manager.save
        .mockResolvedValueOnce({
          ...activeLease,
          status: LeaseStatus.RENEWED,
        } as Lease)
        .mockRejectedValueOnce(
          makeUniqueViolation(
            {
              code: '23505',
              detail: 'Key (unit_id)=(unit-uuid-1) already exists.',
            },
            'duplicate key value violates unique constraint "UQ_leases_active_unit"',
          ),
        );

      await expect(
        service.renew('lease-uuid-1', companyId, {
          status: LeaseStatus.ACTIVE,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rethrows a non-active-lease unique violation from the successor save', async () => {
      const activeLease = { ...mockLease, status: LeaseStatus.ACTIVE } as Lease;
      const activeSuccessor = {
        unitId: 'unit-uuid-1',
        companyId,
        status: LeaseStatus.ACTIVE,
      } as unknown as Lease;

      manager.findOne.mockResolvedValue(activeLease);
      manager.create.mockReturnValue(activeSuccessor);
      activeLeaseCount = 0;
      const other = makeUniqueViolation({
        code: '23505',
        constraint: 'some_other_index',
      });
      manager.save
        .mockResolvedValueOnce({
          ...activeLease,
          status: LeaseStatus.RENEWED,
        } as Lease)
        .mockRejectedValueOnce(other);

      await expect(
        service.renew('lease-uuid-1', companyId, {
          status: LeaseStatus.ACTIVE,
        } as any),
      ).rejects.toBe(other);
    });

    it('throws BadRequestException when lease is TERMINATED', async () => {
      const terminated = {
        ...mockLease,
        status: LeaseStatus.TERMINATED,
      } as Lease;
      manager.findOne.mockResolvedValue(terminated);

      await expect(
        service.renew('lease-uuid-1', companyId, {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when lease is DRAFT', async () => {
      const draft = { ...mockLease, status: LeaseStatus.DRAFT } as Lease;
      manager.findOne.mockResolvedValue(draft);

      await expect(
        service.renew('lease-uuid-1', companyId, {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when lease not found', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.renew('bad-id', companyId, {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('terminate', () => {
    it('terminates an ACTIVE lease under a locked transaction', async () => {
      const activeLease = { ...mockLease, status: LeaseStatus.ACTIVE } as Lease;
      manager.findOne.mockResolvedValue(activeLease);
      manager.save.mockImplementation(async (_e: unknown, l: Lease) => l);

      const result = await service.terminate('lease-uuid-1', companyId);

      expect(manager.findOne).toHaveBeenCalledWith(Lease, {
        where: { id: 'lease-uuid-1', companyId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(LeaseStatus.TERMINATED);
    });

    it('throws BadRequestException when lease is not ACTIVE', async () => {
      const expired = { ...mockLease, status: LeaseStatus.EXPIRED } as Lease;
      manager.findOne.mockResolvedValue(expired);

      await expect(
        service.terminate('lease-uuid-1', companyId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when lease is DRAFT', async () => {
      const draft = { ...mockLease, status: LeaseStatus.DRAFT } as Lease;
      manager.findOne.mockResolvedValue(draft);

      await expect(
        service.terminate('lease-uuid-1', companyId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when lease not found', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.terminate('bad-id', companyId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('removes lease', async () => {
      repo.findOne.mockResolvedValue(mockLease as Lease);
      repo.remove.mockResolvedValue(mockLease as Lease);

      await service.remove('lease-uuid-1', companyId);

      expect(repo.remove).toHaveBeenCalledWith(mockLease);
    });
  });
});
