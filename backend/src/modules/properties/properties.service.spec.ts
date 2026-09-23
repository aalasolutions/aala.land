import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DataSource,
  FindOperator,
  FindOptionsRelations,
  FindOptionsWhere,
  ObjectLiteral,
  QueryFailedError,
  Repository,
  getMetadataArgsStorage,
  IsNull,
  Not,
} from 'typeorm';
import { PropertiesService } from './properties.service';
import { Asset } from './entities/asset.entity';
import { Unit } from './entities/unit.entity';
import { PropertyMedia } from './entities/property-media.entity';
import { PropertyDocument } from './entities/property-document.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { Cheque } from '../cheques/entities/cheque.entity';
import { Transaction } from '../financial/entities/transaction.entity';
import { WorkOrder } from '../maintenance/entities/work-order.entity';
import { Lead } from '../leads/entities/lead.entity';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { StoragePurgeService } from '../storage-purge/storage-purge.service';
import { UnitArchivedFilter } from './dto/unit-archived-filter.enum';
import { Locality } from '../locations/entities/locality.entity';
import { City } from '../locations/entities/city.entity';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Role } from '@shared/enums/roles.enum';
import { ContactsService } from '../contacts/contacts.service';

// A conditional object spread widens past FindOptionsWhere<Asset>, so only
// the entity metadata can catch a wrong `where` key.
function assetWhereKeys(): string[] {
  const storage = getMetadataArgsStorage();
  return [
    ...storage.filterColumns(Asset).map((c) => c.propertyName),
    ...storage.filterRelations(Asset).map((r) => r.propertyName),
  ];
}

// Evaluates a TypeORM `where` against a fixture row so the mock filters the
// way the database would: arrays OR, In() matches membership, nested objects
// walk into relations.
function matchesWhere(row: unknown, where: unknown): boolean {
  if (Array.isArray(where)) {
    return where.some((clause) => matchesWhere(row, clause));
  }
  if (row === null || row === undefined) return false;
  return Object.entries(where as Record<string, unknown>).every(
    ([key, expected]) => {
      const actual = (row as Record<string, unknown>)[key];
      if (expected instanceof FindOperator) {
        if (expected.type === 'isNull') return actual == null;
        return (expected.value as unknown[]).includes(actual);
      }
      if (expected !== null && typeof expected === 'object') {
        if (Array.isArray(actual)) {
          return actual.some((item) => matchesWhere(item, expected));
        }
        return matchesWhere(actual, expected);
      }
      return actual === expected;
    },
  );
}

function inRegion(regionCode: string) {
  return { locality: { city: { regionCode } } };
}

describe('PropertiesService', () => {
  let service: PropertiesService;
  let assetRepo: jest.Mocked<Repository<Asset>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;
  let mediaRepo: jest.Mocked<Repository<PropertyMedia>>;
  let contactRepo: jest.Mocked<Repository<Contact>>;
  let contactsService: jest.Mocked<ContactsService>;
  let unitLockQb: Record<string, jest.Mock>;
  let manager: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };
  let recordHistory: { record: jest.Mock; resolveActorName: jest.Mock };
  let storagePurge: { purge: jest.Mock; dispatch: jest.Mock };
  let events: string[];

  // A query-builder chain mock matching findAllUnits' fluent calls.
  function qbMock(units: Partial<Unit>[], total: number) {
    const chain: Record<string, jest.Mock> = {};
    const mk = (key: string) => {
      chain[key] = jest.fn().mockReturnValue(chain);
    };
    [
      'innerJoin',
      'leftJoin',
      'addSelect',
      'where',
      'andWhere',
      'skip',
      'take',
      'orderBy',
      'addOrderBy',
    ].forEach(mk);
    chain.getManyAndCount = jest
      .fn()
      .mockResolvedValue([units as Unit[], total]);
    return chain;
  }

  const companyId = 'company-uuid-1';

  const mockAsset: Partial<Asset> = {
    id: 'asset-uuid-1',
    name: 'Bay Tower',
    localityId: 'locality-uuid-1',
    createdByCompanyId: companyId,
    address: '123 Road',
  };

  const mockUnit: Partial<Unit> = {
    id: 'unit-uuid-1',
    unitNumber: '1A',
    assetId: 'asset-uuid-1',
    companyId,
  };

  const mockOwner: Partial<Contact> = {
    id: 'owner-uuid-1',
    firstName: 'John',
    lastName: 'Doe',
    companyId,
  };

  function createRepositoryMock<T extends object>() {
    return {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      remove: jest.fn(),
      query: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<T>>;
  }

  beforeEach(async () => {
    events = [];
    unitLockQb = {};
    ['innerJoinAndSelect', 'where', 'andWhere', 'setLock'].forEach((key) => {
      unitLockQb[key] = jest.fn().mockReturnValue(unitLockQb);
    });
    unitLockQb.getOne = jest.fn().mockResolvedValue(null);
    manager = {
      createQueryBuilder: jest.fn().mockReturnValue(unitLockQb),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (_entity: unknown, row: unknown) => row),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => unknown) => {
        const result = await cb(manager);
        events.push('commit');
        return result;
      }),
    };
    recordHistory = {
      record: jest.fn().mockResolvedValue(undefined),
      resolveActorName: jest.fn().mockResolvedValue('Test User'),
    };
    storagePurge = {
      purge: jest.fn().mockResolvedValue(['purge-1']),
      dispatch: jest.fn(async () => {
        events.push('dispatch');
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: DataSource, useValue: dataSource },
        { provide: RecordHistoryService, useValue: recordHistory },
        { provide: StoragePurgeService, useValue: storagePurge },
        {
          provide: getRepositoryToken(Asset),
          useValue: createRepositoryMock<Asset>(),
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: createRepositoryMock<Unit>(),
        },
        {
          provide: getRepositoryToken(PropertyMedia),
          useValue: createRepositoryMock<PropertyMedia>(),
        },
        {
          provide: getRepositoryToken(Contact),
          useValue: createRepositoryMock<Contact>(),
        },
        {
          provide: ContactsService,
          useValue: { resolveOrCreate: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
    assetRepo = module.get(getRepositoryToken(Asset));
    // resolveOwnerId() derives the owner contact region from the asset chain, so
    // this builder has to be chainable by default.
    (assetRepo.createQueryBuilder as jest.Mock).mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ regionCode: 'dubai' }),
    });
    unitRepo = module.get(getRepositoryToken(Unit));
    mediaRepo = module.get(getRepositoryToken(PropertyMedia));
    contactRepo = module.get(getRepositoryToken(Contact));
    contactsService = module.get(ContactsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAsset', () => {
    it('returns an existing asset when the normalized name already exists', async () => {
      assetRepo.findOne.mockResolvedValue(mockAsset as Asset);

      const result = await service.createAsset(companyId, {
        name: '  Bay   Tower  ',
        localityId: 'locality-uuid-1',
        address: '123 Road',
      });

      expect(result).toEqual(mockAsset);
      expect(assetRepo.create).not.toHaveBeenCalled();
      expect(assetRepo.save).not.toHaveBeenCalled();
    });

    it('trims and collapses whitespace before creating a new asset', async () => {
      const createdAsset = { ...mockAsset, name: 'Bay Tower' } as Asset;
      assetRepo.findOne.mockResolvedValueOnce(null);
      assetRepo.create.mockReturnValue(createdAsset);
      assetRepo.save.mockResolvedValue(createdAsset);

      const result = await service.createAsset(companyId, {
        name: '  Bay   Tower  ',
        localityId: 'locality-uuid-1',
        address: '123 Road',
      });

      expect(assetRepo.create).toHaveBeenCalledWith({
        name: 'Bay Tower',
        localityId: 'locality-uuid-1',
        address: '123 Road',
        createdByCompanyId: companyId,
      });
      expect(result).toEqual(createdAsset);
    });

    it('returns the existing asset when a unique violation races with another create', async () => {
      const duplicate = { ...mockAsset, id: 'asset-uuid-2' } as Asset;
      const uniqueViolation = new QueryFailedError(
        'INSERT INTO assets ...',
        [],
        Object.assign(new Error('unique violation'), { code: '23505' }),
      );

      assetRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(duplicate);
      assetRepo.create.mockReturnValue({
        ...duplicate,
        id: 'new-asset',
      } as Asset);
      assetRepo.save.mockRejectedValue(uniqueViolation);

      const result = await service.createAsset(companyId, {
        name: '  Bay   Tower  ',
        localityId: 'locality-uuid-1',
      });

      expect(result).toEqual(duplicate);
    });
  });

  describe('updateAsset', () => {
    it('throws ConflictException when a normalized duplicate already exists', async () => {
      assetRepo.findOne
        .mockResolvedValueOnce(mockAsset as Asset)
        .mockResolvedValueOnce({ ...mockAsset, id: 'asset-uuid-2' } as Asset);

      await expect(
        service.updateAsset('asset-uuid-1', { name: '  Bay   Tower  ' }),
      ).rejects.toThrow(ConflictException);

      expect(assetRepo.save).not.toHaveBeenCalled();
    });

    it('trims and collapses whitespace before saving an updated asset', async () => {
      const existingAsset = { ...mockAsset, name: 'Old Name' } as Asset;
      const savedAsset = { ...existingAsset, name: 'Bay Tower' } as Asset;

      assetRepo.findOne
        .mockResolvedValueOnce(existingAsset)
        .mockResolvedValueOnce(null);
      assetRepo.save.mockResolvedValue(savedAsset);

      const result = await service.updateAsset('asset-uuid-1', {
        name: '  Bay   Tower  ',
      });

      expect(assetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'asset-uuid-1', name: 'Bay Tower' }),
      );
      expect(result).toEqual(savedAsset);
    });

    it('throws NotFoundException when the asset does not exist', async () => {
      assetRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateAsset('missing-asset', { name: 'Bay Tower' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createUnit', () => {
    beforeEach(() => {
      unitRepo.findOne.mockImplementation(
        async () => unitRepo.save.mock.calls.at(-1)?.[0] as Unit,
      );
    });

    it('creates a unit with an existing ownerId after verifying the company', async () => {
      contactRepo.findOne.mockResolvedValue(mockOwner as Contact);
      unitRepo.create.mockImplementation((data) => data as Unit);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

      const result = await service.createUnit(companyId, {
        unitNumber: '1A',
        assetId: 'asset-uuid-1',
        ownerId: 'owner-uuid-1',
      });

      expect(contactRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'owner-uuid-1', companyId },
      });
      expect(contactsService.resolveOrCreate).not.toHaveBeenCalled();
      expect(result.ownerId).toBe('owner-uuid-1');
    });

    it('refuses to create a unit under an asset outside the caller regions', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

      await expect(
        service.createUnit(
          companyId,
          { unitNumber: '1A', assetId: 'asset-uuid-1' } as any,
          'u1',
          { role: Role.AGENT, regionCodes: ['punjab'] },
        ),
      ).rejects.toThrow(NotFoundException);
      expect(unitRepo.save).not.toHaveBeenCalled();
    });

    it('creates a unit under an asset inside the caller regions', async () => {
      contactRepo.findOne.mockResolvedValue(mockOwner as Contact);
      unitRepo.create.mockImplementation((data) => data as Unit);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

      const result = await service.createUnit(
        companyId,
        { unitNumber: '1A', assetId: 'asset-uuid-1' } as any,
        'u1',
        { role: Role.AGENT, regionCodes: ['dubai'] },
      );

      expect(unitRepo.save).toHaveBeenCalled();
      expect(result.unitNumber).toBe('1A');
    });

    it('leaves an admin unconfined when creating a unit', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

      await service.createUnit(
        companyId,
        { unitNumber: '1A', assetId: 'asset-uuid-1' } as any,
        'u1',
        { role: Role.COMPANY_ADMIN, regionCodes: [] },
      );

      expect(unitRepo.save).toHaveBeenCalled();
    });

    it('resolves inline owner details into a contact and links it', async () => {
      contactsService.resolveOrCreate.mockResolvedValue({
        id: 'owner-uuid-1',
      } as Contact);
      unitRepo.create.mockImplementation((data) => data as Unit);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

      const result = await service.createUnit(
        companyId,
        {
          unitNumber: '1A',
          assetId: 'asset-uuid-1',
          owner: {
            firstName: 'Ahmed',
            phone: '+971501234567',
            isWhatsapp: true,
          },
        },
        'user-uuid-1',
      );

      expect(contactsService.resolveOrCreate).toHaveBeenCalledWith(
        companyId,
        { firstName: 'Ahmed', phone: '+971501234567', isWhatsapp: true },
        'user-uuid-1',
        'dubai',
      );
      expect(result.ownerId).toBe('owner-uuid-1');
      expect(unitRepo.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ owner: expect.anything() }),
      );
    });

    it('ignores an empty owner object rather than creating a blank contact', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

      const result = await service.createUnit(companyId, {
        unitNumber: '1A',
        assetId: 'asset-uuid-1',
        owner: {},
      });

      expect(contactsService.resolveOrCreate).not.toHaveBeenCalled();
      expect(result.ownerId).toBeUndefined();
    });

    it('accepts a last name alone as owner details', async () => {
      contactsService.resolveOrCreate.mockResolvedValue({
        id: 'owner-uuid-2',
      } as Contact);
      unitRepo.create.mockImplementation((data) => data as Unit);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

      const result = await service.createUnit(companyId, {
        unitNumber: '1A',
        assetId: 'asset-uuid-1',
        owner: { lastName: 'Al-Rashid Holdings' },
      });

      expect(contactsService.resolveOrCreate).toHaveBeenCalledWith(
        companyId,
        { lastName: 'Al-Rashid Holdings' },
        undefined,
        'dubai',
      );
      expect(result.ownerId).toBe('owner-uuid-2');
    });

    it('prefers ownerId over inline details when both are sent', async () => {
      contactRepo.findOne.mockResolvedValue(mockOwner as Contact);
      unitRepo.create.mockImplementation((data) => data as Unit);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

      const result = await service.createUnit(companyId, {
        unitNumber: '1A',
        assetId: 'asset-uuid-1',
        ownerId: 'owner-uuid-1',
        owner: { firstName: 'Ahmed' },
      });

      expect(contactsService.resolveOrCreate).not.toHaveBeenCalled();
      expect(result.ownerId).toBe('owner-uuid-1');
    });
  });

  describe('findAllUnits', () => {
    it('scopes to ownerId when supplied, excluding units owned by another contact', async () => {
      const qb = qbMock([{ ...mockUnit, ownerId: 'owner-uuid-1' }], 1);
      unitRepo.createQueryBuilder.mockReturnValue(qb as any);
      mediaRepo.find.mockResolvedValue([]);

      const result = await service.findAllUnits(companyId, 1, 20, {
        ownerId: 'owner-uuid-1',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('u.ownerId = :ownerId', {
        ownerId: 'owner-uuid-1',
      });
      expect(result.data).toHaveLength(1);
    });

    it('does not apply an ownerId clause when the filter is absent', async () => {
      const qb = qbMock([mockUnit], 1);
      unitRepo.createQueryBuilder.mockReturnValue(qb as any);
      mediaRepo.find.mockResolvedValue([]);

      await service.findAllUnits(companyId, 1, 20, {});

      expect(
        qb.andWhere.mock.calls.some(([sql]: [string]) =>
          sql.includes('ownerId'),
        ),
      ).toBe(false);
    });
  });

  describe('updateUnit', () => {
    it('assigns ownerId when a valid ownerId is provided, reloaded with owner displayName', async () => {
      unitRepo.findOne
        .mockResolvedValueOnce({ ...mockUnit } as Unit)
        .mockResolvedValueOnce({
          ...mockUnit,
          ownerId: 'owner-uuid-1',
          owner: { ...mockOwner } as Contact,
        } as Unit);
      contactRepo.findOne.mockResolvedValue(mockOwner as Contact);
      unitLockQb.getOne.mockResolvedValue({ ...mockUnit });

      const result = await service.updateUnit('unit-uuid-1', companyId, {
        ownerId: 'owner-uuid-1',
      });

      expect(contactRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'owner-uuid-1', companyId },
      });
      expect(manager.save).toHaveBeenCalledWith(
        Unit,
        expect.objectContaining({ ownerId: 'owner-uuid-1' }),
      );
      expect(unitRepo.findOne).toHaveBeenCalledTimes(2);
      expect(result.ownerId).toBe('owner-uuid-1');
      expect(result.owner).toMatchObject({ displayName: 'John Doe' });
    });

    it('clears ownerId when ownerId is set to null', async () => {
      unitRepo.findOne
        .mockResolvedValueOnce({
          ...mockUnit,
          ownerId: 'owner-uuid-1',
        } as Unit)
        .mockResolvedValueOnce({
          ...mockUnit,
          ownerId: null,
          owner: null,
        } as unknown as Unit);
      unitLockQb.getOne.mockResolvedValue({
        ...mockUnit,
        ownerId: 'owner-uuid-1',
      });

      const result = await service.updateUnit('unit-uuid-1', companyId, {
        ownerId: null,
      });

      expect(contactRepo.findOne).not.toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(
        Unit,
        expect.objectContaining({ ownerId: null }),
      );
      expect(result.ownerId).toBeNull();
    });

    it('throws BadRequestException when ownerId does not belong to the company', async () => {
      unitRepo.findOne.mockResolvedValue({ ...mockUnit } as Unit);
      contactRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateUnit('unit-uuid-1', companyId, {
          ownerId: 'other-company-owner',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(unitRepo.save).not.toHaveBeenCalled();
    });

    it('resolves inline owner details on update when no ownerId is sent', async () => {
      unitRepo.findOne
        .mockResolvedValueOnce({ ...mockUnit } as Unit)
        .mockResolvedValueOnce({
          ...mockUnit,
          ownerId: 'owner-uuid-1',
          owner: { ...mockOwner } as Contact,
        } as Unit);
      contactsService.resolveOrCreate.mockResolvedValue({
        id: 'owner-uuid-1',
      } as Contact);
      contactRepo.findOne.mockResolvedValue(mockOwner as Contact);
      unitLockQb.getOne.mockResolvedValue({ ...mockUnit });

      const result = await service.updateUnit(
        'unit-uuid-1',
        companyId,
        { owner: { firstName: 'Ahmed', phone: '+971501234567' } },
        'user-uuid-1',
      );

      expect(contactsService.resolveOrCreate).toHaveBeenCalledWith(
        companyId,
        { firstName: 'Ahmed', phone: '+971501234567' },
        'user-uuid-1',
        'dubai',
      );
      expect(result.ownerId).toBe('owner-uuid-1');
      expect(result.owner).toMatchObject({ displayName: 'John Doe' });
    });
  });

  describe('bulkImportUnits', () => {
    it('creates units from valid CSV', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      (unitRepo.save as jest.Mock).mockResolvedValue([
        mockUnit,
      ] as unknown as Unit[]);

      const csv =
        'unitNumber,assetId,bedrooms,bathrooms\n101,asset-1,2,1\n102,asset-1,3,2';
      const result = await service.bulkImportUnits(companyId, csv);

      expect(result.created).toBe(2);
      expect(result.failed).toBe(0);
      expect(unitRepo.save).toHaveBeenCalledTimes(1);
    });

    it('reports error for rows missing required fields', async () => {
      const csv = 'unitNumber,assetId\n,asset-1\n102,';
      const result = await service.bulkImportUnits(companyId, csv);

      expect(result.failed).toBe(2);
      expect(result.errors.length).toBe(2);
    });

    it('fails rows whose asset is outside the caller regions', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);

      const csv = 'unitNumber,assetId\n101,asset-1\n102,asset-1';
      const result = await service.bulkImportUnits(companyId, csv, {
        role: Role.AGENT,
        regionCodes: ['punjab'],
      });

      expect(result.created).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors[0]).toContain('outside your regions');
      expect(unitRepo.save).not.toHaveBeenCalled();
    });

    it('imports rows whose asset is inside the caller regions', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      (unitRepo.save as jest.Mock).mockResolvedValue([
        mockUnit,
      ] as unknown as Unit[]);

      const csv = 'unitNumber,assetId\n101,asset-1';
      const result = await service.bulkImportUnits(companyId, csv, {
        role: Role.AGENT,
        regionCodes: ['dubai'],
      });

      expect(result.failed).toBe(0);
      expect(unitRepo.save).toHaveBeenCalledTimes(1);
    });

    it('imports absent bedrooms and bathrooms as unknown, not as a studio', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      (unitRepo.save as jest.Mock).mockResolvedValue([] as unknown as Unit[]);

      const csv = 'unitNumber,assetId,bedrooms,bathrooms\n101,asset-1,,';
      await service.bulkImportUnits(companyId, csv);

      expect(unitRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bedrooms: null, bathrooms: null }),
      );
    });

    it('imports a non-numeric bedrooms value as unknown', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      (unitRepo.save as jest.Mock).mockResolvedValue([] as unknown as Unit[]);

      const csv = 'unitNumber,assetId,bedrooms\n101,asset-1,n/a';
      await service.bulkImportUnits(companyId, csv);

      expect(unitRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bedrooms: null }),
      );
    });

    it('keeps an explicit zero, which is a genuine studio', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      (unitRepo.save as jest.Mock).mockResolvedValue([] as unknown as Unit[]);

      const csv = 'unitNumber,assetId,bedrooms,bathrooms\n101,asset-1,0,0';
      await service.bulkImportUnits(companyId, csv);

      expect(unitRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bedrooms: 0, bathrooms: 0 }),
      );
    });

    it('keeps a stated bedroom count', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      (unitRepo.save as jest.Mock).mockResolvedValue([] as unknown as Unit[]);

      const csv = 'unitNumber,assetId,bedrooms,bathrooms\n101,asset-1,2,1';
      await service.bulkImportUnits(companyId, csv);

      expect(unitRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bedrooms: 2, bathrooms: 1 }),
      );
    });

    it('returns error when CSV has no data rows', async () => {
      const csv = 'unitNumber,assetId';
      const result = await service.bulkImportUnits(companyId, csv);

      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('countUnitsByRegion', () => {
    const companyId = 'company-uuid-1';

    function arrangeCounts(rows: { regionCode: string; count: string }[]) {
      const qb: any = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows),
      };
      (unitRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      return qb;
    }

    it('returns every region for an admin', async () => {
      const qb = arrangeCounts([
        { regionCode: 'makkah', count: '9' },
        { regionCode: 'punjab', count: '1' },
      ]);

      const result = await service.countUnitsByRegion(companyId, {
        userId: 'u1',
        role: Role.COMPANY_ADMIN,
        regionCodes: [],
      });

      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      expect(qb.andWhere).toHaveBeenCalledWith('u.deletedAt IS NULL');
      expect(result).toEqual({ makkah: 9, punjab: 1 });
    });

    it('confines a region-scoped caller to the regions they hold', async () => {
      const qb = arrangeCounts([{ regionCode: 'punjab', count: '1' }]);

      const result = await service.countUnitsByRegion(companyId, {
        userId: 'u1',
        role: Role.AGENT,
        regionCodes: ['punjab'],
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'ci.regionCode IN (:...scopedCodes)',
        { scopedCodes: ['punjab'] },
      );
      expect(result).toEqual({ punjab: 1 });
      expect(result).not.toHaveProperty('makkah');
    });

    it('reports nothing for a scoped caller with no assignments', async () => {
      arrangeCounts([{ regionCode: 'makkah', count: '9' }]);

      const result = await service.countUnitsByRegion(companyId, {
        userId: 'u1',
        role: Role.AGENT,
        regionCodes: [],
      });

      expect(result).toEqual({});
      expect(unitRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('asset tenant confinement', () => {
    const companyId = 'company-uuid-1';

    it('searchAssets is shared across companies: no company predicate', async () => {
      (assetRepo.query as jest.Mock).mockResolvedValue([]);

      await service.searchAssets('locality-1', 'tower', {
        userId: 'u1',
        role: Role.AGENT,
        regionCodes: ['punjab'],
      });

      const [sql, params] = (assetRepo.query as jest.Mock).mock.calls[0];
      expect(sql).not.toContain('company_id');
      expect(params).not.toContain(companyId);
    });

    it('findOneAsset filters only on properties that exist on the Asset entity', async () => {
      (assetRepo.findOne as jest.Mock).mockResolvedValue({ id: 'a1' });

      await service.findOneAsset('a1', companyId);

      const { where } = (assetRepo.findOne as jest.Mock).mock.calls[0][0];
      const known = assetWhereKeys();
      for (const clause of Array.isArray(where) ? where : [where]) {
        for (const key of Object.keys(clause)) {
          expect(known).toContain(key);
        }
      }
    });

    it('findOneAsset scopes to the caller company the same way the list does', async () => {
      (assetRepo.findOne as jest.Mock).mockResolvedValue({ id: 'a1' });

      await service.findOneAsset('a1', companyId);

      const { where } = (assetRepo.findOne as jest.Mock).mock.calls[0][0];
      expect(where).toEqual([
        { id: 'a1', units: { companyId, deletedAt: IsNull() } },
        { id: 'a1', createdByCompanyId: companyId },
      ]);
    });

    it('searchAssets confines a region-scoped caller to their assigned regions', async () => {
      (assetRepo.query as jest.Mock).mockResolvedValue([]);

      await service.searchAssets('locality-1', 'tower', {
        userId: 'u1',
        role: Role.AGENT,
        regionCodes: ['punjab'],
      });

      const [sql, params] = (assetRepo.query as jest.Mock).mock.calls[0];
      expect(sql).toContain('INNER JOIN cities ci');
      expect(sql).toContain('ci.region_code = ANY($3::varchar[])');
      expect(sql).not.toContain('punjab');
      expect(params[2]).toEqual(['punjab']);
    });

    it('searchAssets leaves an admin unconfined by region', async () => {
      (assetRepo.query as jest.Mock).mockResolvedValue([]);

      await service.searchAssets('locality-1', 'tower', {
        userId: 'u1',
        role: Role.COMPANY_ADMIN,
        regionCodes: [],
      });

      const [sql] = (assetRepo.query as jest.Mock).mock.calls[0];
      expect(sql).not.toContain('region_code');
    });

    it('searchAssets returns nothing for a scoped caller with no assignments', async () => {
      (assetRepo.query as jest.Mock).mockResolvedValue([]);

      const result = await service.searchAssets('locality-1', 'tower', {
        userId: 'u1',
        role: Role.AGENT,
        regionCodes: [],
      });

      expect(result).toEqual([]);
      expect(assetRepo.query).not.toHaveBeenCalled();
    });

    it('findOneAsset stays cross-tenant for SUPER_ADMIN, which has no company', async () => {
      (assetRepo.findOne as jest.Mock).mockResolvedValue({ id: 'a1' });

      await service.findOneAsset('a1', undefined);

      expect(assetRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a1' } }),
      );
    });
  });

  describe('getAssetOccupancy region confinement', () => {
    const companyId = 'company-uuid-1';

    function arrangeOccupancy() {
      const qb: any = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      (unitRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      return qb;
    }

    it('confines a region-scoped caller', async () => {
      const qb = arrangeOccupancy();

      await service.getAssetOccupancy(companyId, {
        userId: 'u1',
        role: Role.AGENT,
        regionCodes: ['punjab'],
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'ci.regionCode IN (:...scopedCodes)',
        { scopedCodes: ['punjab'] },
      );
    });

    it('leaves an admin unconfined', async () => {
      const qb = arrangeOccupancy();

      await service.getAssetOccupancy(companyId, {
        userId: 'u1',
        role: Role.COMPANY_ADMIN,
        regionCodes: [],
      });

      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      expect(qb.andWhere).toHaveBeenCalledWith('u.deletedAt IS NULL');
    });

    it('returns nothing for a scoped caller with no assignments', async () => {
      arrangeOccupancy();

      const result = await service.getAssetOccupancy(companyId, {
        userId: 'u1',
        role: Role.AGENT,
        regionCodes: [],
      });

      expect(result).toEqual([]);
      expect(unitRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('findAllAssets region confinement', () => {
    const companyId = 'company-uuid-1';

    it('adds a region predicate for a scoped caller', async () => {
      (assetRepo.findAndCount as jest.Mock).mockResolvedValue([[], 0]);

      await service.findAllAssets(companyId, 1, 100, {
        userId: 'u1',
        role: Role.AGENT,
        regionCodes: ['punjab'],
      });

      const opts = (assetRepo.findAndCount as jest.Mock).mock.calls[0][0];
      for (const clause of opts.where) {
        expect(clause).toHaveProperty('locality');
      }
    });

    it('adds no region predicate for an admin', async () => {
      (assetRepo.findAndCount as jest.Mock).mockResolvedValue([[], 0]);

      await service.findAllAssets(companyId, 1, 100, {
        userId: 'u1',
        role: Role.COMPANY_ADMIN,
        regionCodes: [],
      });

      const opts = (assetRepo.findAndCount as jest.Mock).mock.calls[0][0];
      for (const clause of opts.where) {
        expect(clause).not.toHaveProperty('locality');
      }
    });
  });

  describe('by-id region confinement', () => {
    const companyId = 'company-uuid-1';
    const makkahAgent = {
      userId: 'agent-1',
      role: Role.AGENT,
      regionCodes: ['makkah'],
    };
    const unassignedAgent = {
      userId: 'agent-2',
      role: Role.AGENT,
      regionCodes: [],
    };
    const admin = {
      userId: 'admin-1',
      role: Role.COMPANY_ADMIN,
      regionCodes: [],
    };

    const punjabAsset = {
      id: 'asset-punjab',
      localityId: 'locality-punjab',
      createdByCompanyId: companyId,
      units: [],
      ...inRegion('punjab'),
    } as unknown as Asset;
    const makkahAsset = {
      id: 'asset-makkah',
      localityId: 'locality-makkah',
      createdByCompanyId: companyId,
      units: [],
      ...inRegion('makkah'),
    } as unknown as Asset;

    const punjabUnit = {
      id: 'unit-punjab',
      companyId,
      assetId: 'asset-punjab',
      owner: null,
      asset: inRegion('punjab'),
    } as unknown as Unit;
    const makkahUnit = {
      id: 'unit-makkah',
      companyId,
      assetId: 'asset-makkah',
      owner: null,
      asset: inRegion('makkah'),
    } as unknown as Unit;

    function stubFindOne<T extends ObjectLiteral>(
      repo: jest.Mocked<Repository<T>>,
      rows: T[],
    ) {
      (repo.findOne as jest.Mock).mockImplementation(
        (opts: { where: unknown }) =>
          Promise.resolve(
            rows.find((row) => matchesWhere(row, opts.where)) ?? null,
          ),
      );
    }

    function stubFindAndCount<T extends ObjectLiteral>(
      repo: jest.Mocked<Repository<T>>,
      rows: T[],
    ) {
      (repo.findAndCount as jest.Mock).mockImplementation(
        (opts: { where: unknown }) => {
          const hits = rows.filter((row) => matchesWhere(row, opts.where));
          return Promise.resolve([hits, hits.length]);
        },
      );
    }

    describe('findOneUnit', () => {
      beforeEach(() => stubFindOne(unitRepo, [punjabUnit, makkahUnit]));

      it('denies a by-id read outside the caller regions', async () => {
        await expect(
          service.findOneUnit('unit-punjab', companyId, makkahAgent),
        ).rejects.toThrow(NotFoundException);
      });

      it('allows a by-id read inside the caller regions', async () => {
        const unit = await service.findOneUnit(
          'unit-makkah',
          companyId,
          makkahAgent,
        );

        expect(unit.id).toBe('unit-makkah');
      });

      it('leaves an admin unconfined', async () => {
        const unit = await service.findOneUnit('unit-punjab', companyId, admin);

        expect(unit.id).toBe('unit-punjab');
      });

      it('denies everything for a caller with no assignments', async () => {
        await expect(
          service.findOneUnit('unit-makkah', companyId, unassignedAgent),
        ).rejects.toThrow(NotFoundException);
        expect(unitRepo.findOne).not.toHaveBeenCalled();
      });
    });

    describe('findOneAsset', () => {
      beforeEach(() => stubFindOne(assetRepo, [punjabAsset, makkahAsset]));

      it('denies a by-id read outside the caller regions', async () => {
        await expect(
          service.findOneAsset('asset-punjab', companyId, makkahAgent),
        ).rejects.toThrow(NotFoundException);
      });

      it('allows a by-id read inside the caller regions', async () => {
        const asset = await service.findOneAsset(
          'asset-makkah',
          companyId,
          makkahAgent,
        );

        expect(asset.id).toBe('asset-makkah');
      });

      it('leaves an admin unconfined', async () => {
        const asset = await service.findOneAsset(
          'asset-punjab',
          companyId,
          admin,
        );

        expect(asset.id).toBe('asset-punjab');
      });

      it('denies everything for a caller with no assignments', async () => {
        await expect(
          service.findOneAsset('asset-makkah', companyId, unassignedAgent),
        ).rejects.toThrow(NotFoundException);
        expect(assetRepo.findOne).not.toHaveBeenCalled();
      });
    });

    describe('findUnitsByAsset', () => {
      beforeEach(() => stubFindAndCount(unitRepo, [punjabUnit, makkahUnit]));

      it('withholds units of an asset outside the caller regions', async () => {
        const result = await service.findUnitsByAsset(
          'asset-punjab',
          companyId,
          1,
          20,
          makkahAgent,
        );

        expect(result.data).toEqual([]);
        expect(result.total).toBe(0);
      });

      it('returns units of an asset inside the caller regions', async () => {
        const result = await service.findUnitsByAsset(
          'asset-makkah',
          companyId,
          1,
          20,
          makkahAgent,
        );

        expect(result.data.map((u) => u.id)).toEqual(['unit-makkah']);
      });

      it('leaves an admin unconfined', async () => {
        const result = await service.findUnitsByAsset(
          'asset-punjab',
          companyId,
          1,
          20,
          admin,
        );

        expect(result.data.map((u) => u.id)).toEqual(['unit-punjab']);
      });

      it('narrows an admin to the active region', async () => {
        const result = await service.findUnitsByAsset(
          'asset-punjab',
          companyId,
          1,
          20,
          admin,
          undefined,
          'makkah',
        );

        expect(result.data).toEqual([]);
      });

      it('returns nothing for a caller with no assignments', async () => {
        const result = await service.findUnitsByAsset(
          'asset-makkah',
          companyId,
          1,
          20,
          unassignedAgent,
        );

        expect(result.data).toEqual([]);
        expect(unitRepo.findAndCount).not.toHaveBeenCalled();
      });
    });

    describe('findAssetsByLocality', () => {
      beforeEach(() =>
        stubFindAndCount(assetRepo, [
          { ...punjabAsset, localityId: 'locality-1' } as Asset,
          { ...makkahAsset, localityId: 'locality-1' } as Asset,
        ]),
      );

      it('withholds assets outside the caller regions', async () => {
        const result = await service.findAssetsByLocality(
          'locality-1',
          companyId,
          1,
          20,
          makkahAgent,
        );

        expect(result.data.map((a) => a.id)).toEqual(['asset-makkah']);
      });

      it('leaves an admin unconfined', async () => {
        const result = await service.findAssetsByLocality(
          'locality-1',
          companyId,
          1,
          20,
          admin,
        );

        expect(result.data.map((a) => a.id)).toEqual([
          'asset-punjab',
          'asset-makkah',
        ]);
      });

      it('narrows an admin to the active region', async () => {
        const result = await service.findAssetsByLocality(
          'locality-1',
          companyId,
          1,
          20,
          admin,
          'makkah',
        );

        expect(result.data.map((a) => a.id)).toEqual(['asset-makkah']);
      });

      it('returns nothing for a caller with no assignments', async () => {
        const result = await service.findAssetsByLocality(
          'locality-1',
          companyId,
          1,
          20,
          unassignedAgent,
        );

        expect(result.data).toEqual([]);
        expect(assetRepo.findAndCount).not.toHaveBeenCalled();
      });
    });

    describe('write paths that re-read the row they just touched', () => {
      it('createUnit returns the new unit rather than 404ing on the way out', async () => {
        const created = { ...punjabUnit, id: 'unit-new' } as Unit;
        stubFindOne(unitRepo, [created]);
        unitRepo.create.mockReturnValue(created);
        (unitRepo.save as jest.Mock).mockResolvedValue(created);

        const result = await service.createUnit(companyId, {
          unitNumber: '1A',
          assetId: 'asset-punjab',
        });

        expect(result.id).toBe('unit-new');
      });

      it('updateUnit refuses a unit outside the caller regions', async () => {
        stubFindOne(unitRepo, [punjabUnit, makkahUnit]);

        await expect(
          service.updateUnit(
            'unit-punjab',
            companyId,
            { unitNumber: '2B' },
            'agent-1',
            makkahAgent,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(unitRepo.save).not.toHaveBeenCalled();
      });

      it('updateUnit still returns the row for a unit inside the caller regions', async () => {
        stubFindOne(unitRepo, [punjabUnit, makkahUnit]);
        unitLockQb.getOne.mockResolvedValue({ ...makkahUnit });

        const result = await service.updateUnit(
          'unit-makkah',
          companyId,
          { unitNumber: '2B' },
          'agent-1',
          makkahAgent,
        );

        expect(result.id).toBe('unit-makkah');
        expect(manager.save).toHaveBeenCalledWith(
          Unit,
          expect.objectContaining({ unitNumber: '2B' }),
        );
      });

      it('removeUnit refuses a unit outside the caller regions', async () => {
        await expect(
          service.removeUnit(
            'unit-punjab',
            companyId,
            'Mistake',
            'agent-1',
            makkahAgent,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(unitLockQb.andWhere).toHaveBeenCalledWith(
          'ci.regionCode IN (:...scopedCodes)',
          { scopedCodes: ['makkah'] },
        );
        expect(manager.delete).not.toHaveBeenCalled();
      });
    });

    // Compiles the same `where` with TypeORM itself, so the region predicate is
    // checked against real SQL and not only against the matcher above.
    describe('the filter TypeORM actually compiles', () => {
      let dataSource: DataSource;

      beforeAll(async () => {
        dataSource = new DataSource({
          type: 'postgres',
          entities: [Unit, Asset, Locality, City, Contact, Company, User],
        });
        await (
          dataSource as unknown as { buildMetadatas: () => Promise<void> }
        ).buildMetadatas();
      });

      function compile<T extends ObjectLiteral>(
        target: new () => T,
        call: {
          where: FindOptionsWhere<T> | FindOptionsWhere<T>[];
          relations?: FindOptionsRelations<T> | string[];
        },
      ) {
        const qb = dataSource
          .createQueryBuilder(target, target.name)
          .setFindOptions({
            where: call.where,
            relations: call.relations as FindOptionsRelations<T>,
          });
        return { sql: qb.getQuery(), params: qb.getParameters() };
      }

      it('findOneUnit joins cities and binds the region list', async () => {
        stubFindOne(unitRepo, []);

        await expect(
          service.findOneUnit('unit-1', companyId, makkahAgent),
        ).rejects.toThrow(NotFoundException);

        const { sql, params } = compile(
          Unit,
          (unitRepo.findOne as jest.Mock).mock.calls[0][0],
        );
        expect(sql).toContain('LEFT JOIN "cities"');
        expect(sql).toMatch(/"region_code" IN \(:orm_param_\d+\)/);
        expect(sql).not.toContain('makkah');
        expect(Object.values(params)).toContain('makkah');
      });

      it('lockUnit locks only the unit row behind inner joins', async () => {
        let sql = '';
        manager.createQueryBuilder.mockImplementation(
          (target: new () => Unit, alias: string) => {
            const qb = dataSource.createQueryBuilder(target, alias);
            (qb as any).getOne = jest.fn(async () => {
              sql = qb.getQuery();
              return null;
            });
            return qb;
          },
        );

        await expect(
          service.removeUnit(
            'unit-1',
            companyId,
            'Mistake',
            'agent-1',
            makkahAgent,
          ),
        ).rejects.toThrow(NotFoundException);

        expect(sql).not.toContain('LEFT JOIN');
        expect(sql).toMatch(/FOR UPDATE OF u$/);
        expect(sql).toContain('"u"."company_id" = :companyId');
      });

      it('findOneAsset carries the region predicate in every OR branch', async () => {
        stubFindOne(assetRepo, []);

        await expect(
          service.findOneAsset('asset-1', companyId, makkahAgent),
        ).rejects.toThrow(NotFoundException);

        const { sql, params } = compile(
          Asset,
          (assetRepo.findOne as jest.Mock).mock.calls[0][0],
        );
        expect(sql).toContain('LEFT JOIN "cities"');
        expect(sql.split(' OR ')).toHaveLength(2);
        for (const branch of sql.split(' OR ')) {
          expect(branch).toMatch(/"region_code" IN \(:orm_param_\d+\)/);
        }
        expect(sql).not.toContain('makkah');
        expect(Object.values(params)).toContain('makkah');
      });
    });
  });

  describe('unit and asset lifecycle', () => {
    const actorId = 'user-uuid-1';
    const lockedUnit = () =>
      ({
        id: 'unit-uuid-1',
        unitNumber: 'A-1204',
        companyId,
        assetId: 'asset-uuid-1',
        deletedAt: null,
        asset: {
          id: 'asset-uuid-1',
          name: 'Bay Tower',
          locality: { city: { regionCode: 'dubai' } },
        },
      }) as unknown as Unit;

    describe('removeUnit', () => {
      it.each([
        [Lease, 'leases'],
        [Cheque, 'cheques'],
        [Transaction, 'transactions'],
        [WorkOrder, 'work orders'],
        [Lead, 'leads'],
      ])(
        'refuses with 409 when a %p references the unit',
        async (entity, label) => {
          unitLockQb.getOne.mockResolvedValue(lockedUnit());
          manager.count.mockImplementation((target: unknown) =>
            Promise.resolve(target === entity ? 1 : 0),
          );

          const attempt = service.removeUnit(
            'unit-uuid-1',
            companyId,
            'Mistake',
            actorId,
          );

          await expect(attempt).rejects.toThrow(ConflictException);
          await expect(attempt).rejects.toThrow(
            `This unit has linked ${label}. Archive it instead.`,
          );
          expect(manager.count).toHaveBeenCalledWith(entity, {
            where: { unitId: 'unit-uuid-1', companyId },
          });
          expect(storagePurge.purge).not.toHaveBeenCalled();
          expect(recordHistory.record).not.toHaveBeenCalled();
          expect(manager.delete).not.toHaveBeenCalled();
          expect(storagePurge.dispatch).not.toHaveBeenCalled();
        },
      );

      it('names every blocking type in one message', async () => {
        unitLockQb.getOne.mockResolvedValue(lockedUnit());
        manager.count.mockImplementation((target: unknown) =>
          Promise.resolve(target === Lease || target === Lead ? 2 : 0),
        );

        await expect(
          service.removeUnit('unit-uuid-1', companyId, 'Mistake', actorId),
        ).rejects.toThrow(
          'This unit has linked leases and leads. Archive it instead.',
        );
      });

      it('purges files, records history, removes the unit, then dispatches after commit', async () => {
        unitLockQb.getOne.mockResolvedValue(lockedUnit());
        const media = [{ id: 'm1', companyId }];
        const documents = [{ id: 'd1', companyId }];
        manager.find.mockImplementation((target: unknown) =>
          Promise.resolve(
            target === PropertyMedia
              ? media
              : target === PropertyDocument
                ? documents
                : [],
          ),
        );

        await service.removeUnit('unit-uuid-1', companyId, 'Mistake', actorId);

        expect(unitLockQb.setLock).toHaveBeenCalledWith(
          'pessimistic_write',
          undefined,
          ['u'],
        );
        expect(unitLockQb.andWhere).toHaveBeenCalledWith(
          'u.companyId = :companyId',
          { companyId },
        );
        expect(manager.find).toHaveBeenCalledWith(PropertyMedia, {
          where: { unitId: 'unit-uuid-1', companyId },
        });
        expect(manager.find).toHaveBeenCalledWith(PropertyDocument, {
          where: { unitId: 'unit-uuid-1', companyId },
        });
        expect(storagePurge.purge).toHaveBeenCalledWith(manager, {
          media,
          documents,
        });
        expect(recordHistory.record).toHaveBeenCalledWith(manager, {
          companyId,
          action: RecordHistoryAction.DELETE,
          entityType: 'Unit',
          entityId: 'unit-uuid-1',
          entityTitle: 'A-1204',
          contextTitle: 'Bay Tower',
          reason: 'Mistake',
          actorId,
          actorName: 'Test User',
          regionCode: 'dubai',
          metadata: { fileCount: 2 },
        });
        expect(manager.delete).toHaveBeenCalledWith(Unit, {
          id: 'unit-uuid-1',
          companyId,
        });
        expect(storagePurge.dispatch).toHaveBeenCalledWith(['purge-1']);
        expect(events).toEqual(['commit', 'dispatch']);
      });

      it('throws NotFoundException for a unit of another company', async () => {
        unitLockQb.getOne.mockResolvedValue(null);

        await expect(
          service.removeUnit(
            'unit-uuid-1',
            'other-company',
            'Mistake',
            actorId,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(unitLockQb.andWhere).toHaveBeenCalledWith(
          'u.companyId = :companyId',
          { companyId: 'other-company' },
        );
        expect(storagePurge.dispatch).not.toHaveBeenCalled();
      });
    });

    describe('removeAsset', () => {
      const asset = { id: 'asset-uuid-1', name: 'Bay Tower' };

      it('refuses with 409 while the asset has units in any company', async () => {
        manager.findOne.mockResolvedValue(asset);
        manager.count.mockResolvedValue(3);

        await expect(
          service.removeAsset('asset-uuid-1', 'Duplicate', actorId),
        ).rejects.toThrow(ConflictException);
        expect(manager.count).toHaveBeenCalledWith(Unit, {
          where: { assetId: 'asset-uuid-1' },
        });
        expect(storagePurge.purge).not.toHaveBeenCalled();
        expect(manager.delete).not.toHaveBeenCalled();
      });

      it('purges files across companies, records global history, removes the asset', async () => {
        manager.findOne.mockResolvedValue(asset);
        const media = [
          { id: 'm1', companyId },
          { id: 'm2', companyId: 'company-uuid-2' },
        ];
        manager.find.mockImplementation((target: unknown) =>
          Promise.resolve(target === PropertyMedia ? media : []),
        );

        await service.removeAsset('asset-uuid-1', 'Duplicate', actorId);

        expect(manager.findOne).toHaveBeenCalledWith(Asset, {
          where: { id: 'asset-uuid-1' },
          lock: { mode: 'pessimistic_write' },
        });
        expect(manager.find).toHaveBeenCalledWith(PropertyMedia, {
          where: { assetId: 'asset-uuid-1' },
        });
        expect(storagePurge.purge).toHaveBeenCalledWith(manager, {
          media,
          documents: [],
        });
        expect(recordHistory.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            companyId: null,
            action: RecordHistoryAction.DELETE,
            entityType: 'Asset',
            entityTitle: 'Bay Tower',
            reason: 'Duplicate',
            metadata: { fileCount: 2 },
          }),
        );
        expect(manager.delete).toHaveBeenCalledWith(Asset, {
          id: 'asset-uuid-1',
        });
        expect(events).toEqual(['commit', 'dispatch']);
      });

      it('throws NotFoundException when the asset does not exist', async () => {
        await expect(
          service.removeAsset('missing', 'Duplicate', actorId),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('archiveUnit', () => {
      it('refuses with 409 when the unit is already archived', async () => {
        unitLockQb.getOne.mockResolvedValue({
          ...lockedUnit(),
          deletedAt: new Date(),
        });

        await expect(
          service.archiveUnit('unit-uuid-1', companyId, 'Sold', actorId),
        ).rejects.toThrow(ConflictException);
        expect(manager.update).not.toHaveBeenCalled();
      });

      it('refuses with 409 while the unit has an ACTIVE lease', async () => {
        unitLockQb.getOne.mockResolvedValue(lockedUnit());
        manager.count.mockResolvedValue(1);

        await expect(
          service.archiveUnit('unit-uuid-1', companyId, 'Sold', actorId),
        ).rejects.toThrow('This unit has an active lease');
        expect(manager.count).toHaveBeenCalledWith(Lease, {
          where: {
            unitId: 'unit-uuid-1',
            companyId,
            status: LeaseStatus.ACTIVE,
          },
        });
        expect(manager.update).not.toHaveBeenCalled();
        expect(recordHistory.record).not.toHaveBeenCalled();
      });

      it.each([
        [Lead, 'open leads'],
        [Cheque, 'open cheques'],
        [WorkOrder, 'open work orders'],
        [Transaction, 'open transactions'],
      ])('refuses with 409 while a %p is open', async (entity, label) => {
        unitLockQb.getOne.mockResolvedValue(lockedUnit());
        manager.count.mockImplementation((target: unknown) =>
          Promise.resolve(target === entity ? 1 : 0),
        );

        await expect(
          service.archiveUnit('unit-uuid-1', companyId, 'Sold', actorId),
        ).rejects.toThrow(
          `This unit has ${label}. Close them before archiving.`,
        );
        expect(manager.update).not.toHaveBeenCalled();
      });

      it('names every open kind in one message', async () => {
        unitLockQb.getOne.mockResolvedValue(lockedUnit());
        manager.count.mockImplementation((target: unknown) =>
          Promise.resolve(
            target === Lease || target === Lead || target === Cheque ? 1 : 0,
          ),
        );

        await expect(
          service.archiveUnit('unit-uuid-1', companyId, 'Sold', actorId),
        ).rejects.toThrow(
          'This unit has an active lease, open leads and open cheques. Close them before archiving.',
        );
      });

      it('counts cheques on the unit and on its leases', async () => {
        unitLockQb.getOne.mockResolvedValue(lockedUnit());
        unitRepo.findOne.mockResolvedValue(lockedUnit());

        await service.archiveUnit('unit-uuid-1', companyId, 'Sold', actorId);

        expect(manager.count).toHaveBeenCalledWith(Cheque, {
          where: [
            expect.objectContaining({ unitId: 'unit-uuid-1', companyId }),
            expect.objectContaining({
              lease: { unitId: 'unit-uuid-1' },
              companyId,
            }),
          ],
        });
      });

      it('sets deletedAt and records ARCHIVE in the same transaction', async () => {
        unitLockQb.getOne.mockResolvedValue(lockedUnit());
        unitRepo.findOne.mockResolvedValue({
          ...lockedUnit(),
          deletedAt: new Date(),
          owner: null,
        } as Unit);

        const result = await service.archiveUnit(
          'unit-uuid-1',
          companyId,
          'Sold',
          actorId,
        );

        expect(manager.update).toHaveBeenCalledWith(
          Unit,
          { id: 'unit-uuid-1', companyId },
          { deletedAt: expect.any(Date) },
        );
        expect(recordHistory.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            action: RecordHistoryAction.ARCHIVE,
            entityType: 'Unit',
            reason: 'Sold',
          }),
        );
        expect(result.deletedAt).toBeInstanceOf(Date);
      });
    });

    describe('unarchiveUnit', () => {
      it('refuses with 409 when the unit is not archived', async () => {
        unitLockQb.getOne.mockResolvedValue(lockedUnit());

        await expect(
          service.unarchiveUnit('unit-uuid-1', companyId, undefined, actorId),
        ).rejects.toThrow(ConflictException);
        expect(manager.update).not.toHaveBeenCalled();
      });

      it('clears deletedAt and records UNARCHIVE without a reason', async () => {
        unitLockQb.getOne.mockResolvedValue({
          ...lockedUnit(),
          deletedAt: new Date(),
        });
        unitRepo.findOne.mockResolvedValue({
          ...lockedUnit(),
          owner: null,
        } as Unit);

        await service.unarchiveUnit(
          'unit-uuid-1',
          companyId,
          undefined,
          actorId,
        );

        expect(manager.update).toHaveBeenCalledWith(
          Unit,
          { id: 'unit-uuid-1', companyId },
          { deletedAt: null },
        );
        expect(recordHistory.record).toHaveBeenCalledWith(
          manager,
          expect.objectContaining({
            action: RecordHistoryAction.UNARCHIVE,
            reason: null,
          }),
        );
      });
    });

    describe('archived unit rules', () => {
      it('updateUnit refuses an archived unit with 409', async () => {
        unitRepo.findOne.mockResolvedValue({
          ...mockUnit,
          deletedAt: new Date(),
        } as Unit);

        await expect(
          service.updateUnit('unit-uuid-1', companyId, { floor: '3' }),
        ).rejects.toThrow(ConflictException);
        expect(unitRepo.save).not.toHaveBeenCalled();
      });

      it('updateUnit refuses a unit archived after the first read', async () => {
        unitRepo.findOne.mockResolvedValue({ ...mockUnit } as Unit);
        unitLockQb.getOne.mockResolvedValue({
          ...mockUnit,
          deletedAt: new Date(),
        });

        await expect(
          service.updateUnit('unit-uuid-1', companyId, { floor: '3' }),
        ).rejects.toThrow(ConflictException);
        expect(unitLockQb.setLock).toHaveBeenCalledWith(
          'pessimistic_write',
          undefined,
          ['u'],
        );
        expect(manager.save).not.toHaveBeenCalled();
      });

      it('findOneUnit still returns an archived unit with deletedAt', async () => {
        const deletedAt = new Date();
        unitRepo.findOne.mockResolvedValue({
          ...mockUnit,
          deletedAt,
          owner: null,
        } as Unit);

        const unit = await service.findOneUnit('unit-uuid-1', companyId);

        expect(unit.deletedAt).toBe(deletedAt);
      });

      it('findAllUnits excludes archived units by default', async () => {
        const qb = qbMock([mockUnit], 1);
        unitRepo.createQueryBuilder.mockReturnValue(qb as any);
        mediaRepo.find.mockResolvedValue([]);

        const result = await service.findAllUnits(companyId, 1, 20, {});

        expect(qb.andWhere).toHaveBeenCalledWith('u.deletedAt IS NULL');
        expect(result.data[0]).toHaveProperty('deletedAt', null);
      });

      it('findAllUnits returns only archived units for archived=only', async () => {
        const qb = qbMock([], 0);
        unitRepo.createQueryBuilder.mockReturnValue(qb as any);

        await service.findAllUnits(companyId, 1, 20, {
          archived: UnitArchivedFilter.ONLY,
        });

        expect(qb.andWhere).toHaveBeenCalledWith('u.deletedAt IS NOT NULL');
        expect(qb.andWhere).not.toHaveBeenCalledWith('u.deletedAt IS NULL');
      });

      it('findAllUnits applies no archive clause for archived=include', async () => {
        const qb = qbMock([], 0);
        unitRepo.createQueryBuilder.mockReturnValue(qb as any);

        await service.findAllUnits(companyId, 1, 20, {
          archived: UnitArchivedFilter.INCLUDE,
        });

        expect(
          qb.andWhere.mock.calls.some(([sql]: [string]) =>
            sql.includes('deletedAt'),
          ),
        ).toBe(false);
      });

      it('findUnitsByAsset excludes archived units', async () => {
        (unitRepo.findAndCount as jest.Mock).mockResolvedValue([[], 0]);

        await service.findUnitsByAsset('asset-uuid-1', companyId);

        expect(unitRepo.findAndCount).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ deletedAt: IsNull() }),
          }),
        );
      });

      it('findUnitsByAsset returns only archived units with deletedAt for archived=only', async () => {
        const deletedAt = new Date('2026-09-01T00:00:00Z');
        (unitRepo.findAndCount as jest.Mock).mockResolvedValue([
          [{ ...mockUnit, deletedAt }],
          1,
        ]);

        const result = await service.findUnitsByAsset(
          'asset-uuid-1',
          companyId,
          1,
          20,
          undefined,
          UnitArchivedFilter.ONLY,
        );

        expect(unitRepo.findAndCount).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              assetId: 'asset-uuid-1',
              companyId,
              deletedAt: Not(IsNull()),
            }),
          }),
        );
        expect(result.data[0]).toHaveProperty('deletedAt', deletedAt);
      });

      it('findUnitsByAsset applies no archive clause for archived=include', async () => {
        (unitRepo.findAndCount as jest.Mock).mockResolvedValue([[], 0]);

        await service.findUnitsByAsset(
          'asset-uuid-1',
          companyId,
          1,
          20,
          undefined,
          UnitArchivedFilter.INCLUDE,
        );

        const { where } = (unitRepo.findAndCount as jest.Mock).mock.calls[0][0];
        expect(where).toEqual({ assetId: 'asset-uuid-1', companyId });
      });

      it('findAllAssets does not reveal an asset through archived units only', async () => {
        (assetRepo.findAndCount as jest.Mock).mockResolvedValue([
          [
            {
              id: 'a1',
              units: [
                { id: 'u1', companyId, deletedAt: new Date() },
                { id: 'u2', companyId, deletedAt: null },
              ],
            },
          ],
          1,
        ]);

        const result = await service.findAllAssets(companyId);

        const opts = (assetRepo.findAndCount as jest.Mock).mock.calls[0][0];
        expect(opts.where[0].units).toEqual({ companyId, deletedAt: IsNull() });
        expect(result.data[0].units.map((u) => u.id)).toEqual(['u2']);
      });
    });
  });
});
