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
import { ContactsService } from '../contacts/contacts.service';
import { Lease, LeaseStatus, LeaseType } from './entities/lease.entity';
import { Unit } from '../properties/entities/unit.entity';

describe('LeasesService', () => {
  let service: LeasesService;
  let repo: jest.Mocked<Repository<Lease>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;
  let contactsService: { findOneEntity: jest.Mock };
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
    contactId: 'contact-uuid-1',
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
          provide: getRepositoryToken(Unit),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: ContactsService,
          useValue: {
            findOneEntity: jest
              .fn()
              .mockResolvedValue({ id: 'contact-uuid-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<LeasesService>(LeasesService);
    repo = module.get(getRepositoryToken(Lease));
    unitRepo = module.get(getRepositoryToken(Unit));
    // The unit lookup now runs for every caller, admins included, because it
    // also enforces company ownership. Region tests override this.
    unitRepo.findOne.mockResolvedValue({ id: 'unit-uuid-1' } as Unit);
    contactsService = module.get(ContactsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates and returns a lease, reloaded with the contact relation', async () => {
      repo.create.mockReturnValue(mockLease as Lease);
      repo.save.mockResolvedValue(mockLease as Lease);
      repo.findOne.mockResolvedValue(mockLease as Lease);

      const dto = {
        unitId: 'unit-uuid-1',
        contactId: 'contact-uuid-1',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monthlyRent: 5000,
      };
      const result = await service.create(companyId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({ ...dto, companyId });
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: mockLease.id, companyId },
        relations: ['contact'],
      });
      expect(result).toEqual(mockLease);
    });
  });

  describe('findAll', () => {
    function qbMock(rows: Lease[], total: number) {
      const chain: Record<string, jest.Mock> = {};
      const mk = (key: string) => {
        chain[key] = jest.fn().mockReturnValue(chain);
      };
      [
        'leftJoinAndSelect',
        'where',
        'andWhere',
        'skip',
        'take',
        'orderBy',
      ].forEach(mk);
      chain.getManyAndCount = jest.fn().mockResolvedValue([rows, total]);
      return chain;
    }

    it('returns paginated leases with contact and unit relations', async () => {
      const qb = qbMock([mockLease as Lease], 1);
      (repo.createQueryBuilder as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(qb);

      const result = await service.findAll(companyId, 1, 20);

      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('l.contact', 'tenant');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('l.unit', 'unit');
      expect(qb.where).toHaveBeenCalledWith('l.companyId = :companyId', {
        companyId,
      });
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.data).toEqual([mockLease]);
    });

    it('scopes to contactId when supplied, still with unit relation loaded', async () => {
      const qb = qbMock([mockLease as Lease], 1);
      (repo.createQueryBuilder as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(qb);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        'contact-uuid-1',
      );

      expect(qb.andWhere).toHaveBeenCalledWith('l.contactId = :contactId', {
        contactId: 'contact-uuid-1',
      });
      expect(result.data).toEqual([mockLease]);
    });

    it('filters by status when provided', async () => {
      const qb = qbMock([mockLease as Lease], 1);
      (repo.createQueryBuilder as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(qb);

      await service.findAll(companyId, 1, 20, undefined, undefined, {
        status: LeaseStatus.ACTIVE,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('l.status = :status', {
        status: LeaseStatus.ACTIVE,
      });
    });

    it('filters by type when provided', async () => {
      const qb = qbMock([mockLease as Lease], 1);
      (repo.createQueryBuilder as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(qb);

      await service.findAll(companyId, 1, 20, undefined, undefined, {
        type: LeaseType.COMMERCIAL,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('l.type = :type', {
        type: LeaseType.COMMERCIAL,
      });
    });

    it('filters by search against tenant name, unit number and ejari number', async () => {
      const qb = qbMock([mockLease as Lease], 1);
      (repo.createQueryBuilder as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(qb);

      await service.findAll(companyId, 1, 20, undefined, undefined, {
        search: 'zainab',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(tenant.firstName ILIKE :s OR tenant.lastName ILIKE :s OR unit.unitNumber ILIKE :s OR l.ejariNumber ILIKE :s)',
        { s: '%zainab%' },
      );
    });

    it('filters by dateFrom', async () => {
      const qb = qbMock([mockLease as Lease], 1);
      (repo.createQueryBuilder as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(qb);

      await service.findAll(companyId, 1, 20, undefined, undefined, {
        dateFrom: '2026-01-01',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('l.startDate >= :dateFrom', {
        dateFrom: '2026-01-01',
      });
    });

    it('filters by dateTo inclusively (through the end of that day)', async () => {
      const qb = qbMock([mockLease as Lease], 1);
      (repo.createQueryBuilder as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(qb);

      await service.findAll(companyId, 1, 20, undefined, undefined, {
        dateTo: '2026-01-31',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        "l.startDate < :dateTo::date + interval '1 day'",
        { dateTo: '2026-01-31' },
      );
    });

    it('combines status, type, search and date range filters together', async () => {
      const qb = qbMock([mockLease as Lease], 1);
      (repo.createQueryBuilder as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(qb);

      await service.findAll(companyId, 1, 20, undefined, undefined, {
        status: LeaseStatus.ACTIVE,
        type: LeaseType.RESIDENTIAL,
        search: 'zainab',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('l.status = :status', {
        status: LeaseStatus.ACTIVE,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('l.type = :type', {
        type: LeaseType.RESIDENTIAL,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(tenant.firstName ILIKE :s OR tenant.lastName ILIKE :s OR unit.unitNumber ILIKE :s OR l.ejariNumber ILIKE :s)',
        { s: '%zainab%' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('l.startDate >= :dateFrom', {
        dateFrom: '2026-01-01',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        "l.startDate < :dateTo::date + interval '1 day'",
        { dateTo: '2026-01-31' },
      );
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
        relations: ['contact'],
        order: { startDate: 'DESC' },
      });
      expect(result).toEqual([mockLease]);
    });

    it('attaches displayName to each lease tenant', async () => {
      const leaseWithContact = {
        ...mockLease,
        contact: { firstName: 'Zainab', lastName: 'Qureshi' },
      } as Lease;
      repo.find.mockResolvedValue([leaseWithContact]);

      const [result] = await service.findByUnit('unit-uuid-1', companyId);

      expect(result.contact).toMatchObject({ displayName: 'Zainab Qureshi' });
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
        contactId: 'contact-uuid-1',
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
      const reloadedOldLease = {
        ...activeLease,
        status: LeaseStatus.RENEWED,
        contact: null,
      } as Lease;
      const reloadedNewLease = { ...savedNewLease, contact: null } as Lease;

      manager.findOne
        .mockResolvedValueOnce(activeLease) // initial FOR UPDATE lock load
        .mockResolvedValueOnce(reloadedOldLease) // reloadWithContact(oldLease.id)
        .mockResolvedValueOnce(reloadedNewLease); // reloadWithContact(newLease.id)
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
      expect(manager.findOne).toHaveBeenNthCalledWith(1, Lease, {
        where: { id: 'lease-uuid-1', companyId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.oldLease).toEqual(reloadedOldLease);
      expect(result.newLease).toEqual(reloadedNewLease);
    });

    it('allows renewal of EXPIRED lease', async () => {
      const expiredLease = {
        ...mockLease,
        status: LeaseStatus.EXPIRED,
      } as Lease;
      const newLeaseData = {
        unitId: 'unit-uuid-1',
        contactId: 'contact-uuid-1',
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
  describe('region scoping', () => {
    const makkahManager = { role: 'manager', regionCodes: ['makkah'] };
    const twoRegionManager = {
      role: 'manager',
      regionCodes: ['makkah', 'punjab'],
    };
    const admin = { role: 'company_admin', regionCodes: ['makkah'] };

    const unitRegions: Record<string, string> = {
      'unit-makkah': 'makkah',
      'unit-punjab': 'punjab',
    };

    // Stands in for Postgres: a lease has no region column, so the fake
    // resolves the unitId subquery predicate through a unit -> region map. The
    // locked read inside the transaction goes through the same rule.
    function seedLeaseOnUnit(unitId: string) {
      const row = { ...mockLease, unitId } as Lease;
      const read = (opts: any) => {
        const filter = opts?.where?.unitId;
        if (filter) {
          const codes = filter.objectLiteralParameters?.regionCodes as string[];
          if (!codes.includes(unitRegions[unitId])) {
            return Promise.resolve(null);
          }
        }
        return Promise.resolve(row);
      };
      repo.findOne.mockImplementation(read);
      manager.findOne.mockImplementation((_entity: unknown, opts: any) =>
        read(opts),
      );
      manager.save.mockImplementation(async (_entity: unknown, l: Lease) => l);
      return row;
    }

    it('denies findOne on a lease outside the caller assigned regions', async () => {
      seedLeaseOnUnit('unit-punjab');

      await expect(
        service.findOne('lease-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows a by-id read in any region the caller is assigned to', async () => {
      seedLeaseOnUnit('unit-punjab');

      const result = await service.findOne(
        'lease-uuid-1',
        companyId,
        twoRegionManager,
      );

      expect(result.id).toBe('lease-uuid-1');
    });

    it('denies update on a lease outside the caller assigned regions', async () => {
      seedLeaseOnUnit('unit-punjab');

      await expect(
        service.update(
          'lease-uuid-1',
          companyId,
          { monthlyRent: 9000 },
          makkahManager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('denies renew on a lease outside the caller assigned regions', async () => {
      seedLeaseOnUnit('unit-punjab');

      await expect(
        service.renew(
          'lease-uuid-1',
          companyId,
          {
            unitId: 'unit-punjab',
            startDate: '2027-01-01',
            endDate: '2027-12-31',
            monthlyRent: 5000,
          } as any,
          makkahManager,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('denies terminate on a lease outside the caller assigned regions', async () => {
      seedLeaseOnUnit('unit-punjab');

      await expect(
        service.terminate('lease-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('terminates a lease inside the caller assigned regions', async () => {
      const row = seedLeaseOnUnit('unit-punjab');

      const result = await service.terminate(
        'lease-uuid-1',
        companyId,
        twoRegionManager,
      );

      expect(result.id).toBe('lease-uuid-1');
      expect(row.status).toBe(LeaseStatus.TERMINATED);
    });

    it('denies remove on a lease outside the caller assigned regions', async () => {
      seedLeaseOnUnit('unit-punjab');

      await expect(
        service.remove('lease-uuid-1', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('denies every by-id read when the caller has no assigned region', async () => {
      seedLeaseOnUnit('unit-makkah');

      await expect(
        service.findOne('lease-uuid-1', companyId, {
          role: 'manager',
          regionCodes: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('leaves admins unconfined by their own assignments', async () => {
      seedLeaseOnUnit('unit-punjab');

      const result = await service.findOne('lease-uuid-1', companyId, admin);

      expect(result.id).toBe('lease-uuid-1');
    });

    it('stays unscoped when no caller is supplied', async () => {
      seedLeaseOnUnit('unit-punjab');

      const result = await service.findOne('lease-uuid-1', companyId);

      expect(result.id).toBe('lease-uuid-1');
    });

    describe('tenant contact', () => {
      // ContactsService confines its own by-id read, so a contact the caller
      // cannot see resolves to NotFound here too.
      function contactInRegion(regionCode: string) {
        contactsService.findOneEntity.mockImplementation(
          (_id: string, _companyId: string, caller?: any) => {
            if (
              caller &&
              caller.role === 'manager' &&
              !(caller.regionCodes as string[]).includes(regionCode)
            ) {
              return Promise.reject(new NotFoundException('Contact not found'));
            }
            return Promise.resolve({ id: 'contact-uuid-1' });
          },
        );
      }

      it('denies create when the tenant contact is outside the caller regions', async () => {
        contactInRegion('punjab');

        await expect(
          service.create(
            companyId,
            {
              unitId: 'unit-makkah',
              contactId: 'contact-uuid-1',
              startDate: '2026-01-01',
              endDate: '2026-12-31',
              monthlyRent: 5000,
            } as any,
            makkahManager,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('denies update when the tenant contact is outside the caller regions', async () => {
        seedLeaseOnUnit('unit-makkah');
        contactInRegion('punjab');

        await expect(
          service.update(
            'lease-uuid-1',
            companyId,
            { contactId: 'contact-uuid-1' },
            makkahManager,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('accepts a tenant contact inside the caller regions', async () => {
        seedLeaseOnUnit('unit-makkah');
        contactInRegion('makkah');

        const result = await service.update(
          'lease-uuid-1',
          companyId,
          { contactId: 'contact-uuid-1' },
          makkahManager,
        );

        expect(result.id).toBe('lease-uuid-1');
      });
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
        return Promise.resolve({ id } as Unit);
      });
    }

    // Stands in for Postgres on the list read: the seeded leases survive only
    // when the region predicate the service built admits their unit's region.
    function seedLeaseListOnUnits(unitIds: string[]) {
      const rows = unitIds.map(
        (unitId) => ({ ...mockLease, id: `lease-${unitId}`, unitId }) as Lease,
      );
      let codes: string[] | undefined;
      const chain: Record<string, jest.Mock> = {};
      ['leftJoinAndSelect', 'where', 'skip', 'take', 'orderBy'].forEach(
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
      chain.getManyAndCount = jest.fn().mockImplementation(() => {
        const matched = codes
          ? rows.filter((row) => codes!.includes(unitRegions[row.unitId]))
          : rows;
        return Promise.resolve([matched, matched.length]);
      });
      (repo.createQueryBuilder as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(chain);
      return rows;
    }

    it('confines the list to the caller assigned regions', async () => {
      seedLeaseListOnUnits(['unit-makkah', 'unit-punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        makkahManager,
      );

      expect(result.data.map((l) => l.unitId)).toEqual(['unit-makkah']);
      expect(result.total).toBe(1);
    });

    it('lists no leases from a region outside the caller assignments', async () => {
      seedLeaseListOnUnits(['unit-makkah', 'unit-punjab']);

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
      seedLeaseListOnUnits(['unit-makkah', 'unit-punjab']);

      const result = await service.findAll(
        companyId,
        1,
        20,
        undefined,
        undefined,
        undefined,
        admin,
      );

      expect(result.data.map((l) => l.unitId)).toEqual([
        'unit-makkah',
        'unit-punjab',
      ]);
    });

    it('lists nothing when the caller has no assigned region', async () => {
      seedLeaseListOnUnits(['unit-makkah', 'unit-punjab']);

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

    it('denies findByUnit for a unit outside the caller assigned regions', async () => {
      seedUnitLookup();
      repo.find.mockResolvedValue([mockLease as Lease]);

      await expect(
        service.findByUnit('unit-punjab', companyId, makkahManager),
      ).rejects.toThrow(NotFoundException);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('returns the leases of a unit inside the caller assigned regions', async () => {
      seedUnitLookup();
      const row = { ...mockLease, unitId: 'unit-punjab' } as Lease;
      repo.find.mockResolvedValue([row]);

      const result = await service.findByUnit(
        'unit-punjab',
        companyId,
        twoRegionManager,
      );

      expect(result.map((l) => l.id)).toEqual(['lease-uuid-1']);
    });

    it('denies findByUnit when the caller has no assigned region', async () => {
      seedUnitLookup();
      repo.find.mockResolvedValue([mockLease as Lease]);

      await expect(
        service.findByUnit('unit-makkah', companyId, {
          role: 'manager',
          regionCodes: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(unitRepo.findOne).not.toHaveBeenCalled();
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('leaves findByUnit unconfined for admins', async () => {
      seedUnitLookup();
      const row = { ...mockLease, unitId: 'unit-punjab' } as Lease;
      repo.find.mockResolvedValue([row]);

      const result = await service.findByUnit('unit-punjab', companyId, admin);

      expect(result.map((l) => l.id)).toEqual(['lease-uuid-1']);
      // Still company-checked, just not region-confined.
      const opts = (unitRepo.findOne as jest.Mock).mock.calls[0][0];
      expect(opts.where.companyId).toBe(companyId);
      expect(opts.where.asset).toBeUndefined();
    });

    describe('unit binding', () => {
      const dtoOnUnit = (unitId: string) =>
        ({
          unitId,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          monthlyRent: 5000,
        }) as any;

      it('denies an admin binding a unit from another company', async () => {
        unitRepo.findOne.mockImplementation((opts: any) =>
          Promise.resolve(
            opts?.where?.companyId === companyId
              ? ({ id: opts.where.id } as Unit)
              : null,
          ),
        );

        await expect(
          service.create(
            'another-company-uuid',
            dtoOnUnit('unit-uuid-1'),
            admin,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('denies create when the unit is outside the caller regions', async () => {
        seedUnitLookup();

        await expect(
          service.create(companyId, dtoOnUnit('unit-punjab'), makkahManager),
        ).rejects.toThrow(NotFoundException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('creates a lease on a unit inside the caller regions', async () => {
        seedUnitLookup();
        const row = { ...mockLease, unitId: 'unit-punjab' } as Lease;
        repo.create.mockReturnValue(row);
        repo.save.mockResolvedValue(row);
        repo.findOne.mockResolvedValue(row);

        const result = await service.create(
          companyId,
          dtoOnUnit('unit-punjab'),
          twoRegionManager,
        );

        expect(result.id).toBe('lease-uuid-1');
      });

      it('denies create when the caller has no assigned region', async () => {
        seedUnitLookup();

        await expect(
          service.create(companyId, dtoOnUnit('unit-makkah'), {
            role: 'manager',
            regionCodes: [],
          }),
        ).rejects.toThrow(NotFoundException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('denies renew onto a unit outside the caller regions', async () => {
        seedUnitLookup();
        seedLeaseOnUnit('unit-makkah');

        await expect(
          service.renew(
            'lease-uuid-1',
            companyId,
            dtoOnUnit('unit-punjab'),
            makkahManager,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(manager.save).not.toHaveBeenCalled();
      });
    });
  });
});
