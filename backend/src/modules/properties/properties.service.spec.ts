import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PropertiesService } from './properties.service';
import { PropertyArea } from './entities/property-area.entity';
import { Asset } from './entities/asset.entity';
import { Unit } from './entities/unit.entity';
import { PropertyMedia } from './entities/property-media.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { ContactsService } from '../contacts/contacts.service';

describe('PropertiesService', () => {
  let service: PropertiesService;
  let areaRepo: jest.Mocked<Repository<PropertyArea>>;
  let assetRepo: jest.Mocked<Repository<Asset>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;
  let mediaRepo: jest.Mocked<Repository<PropertyMedia>>;
  let contactRepo: jest.Mocked<Repository<Contact>>;
  let contactsService: jest.Mocked<ContactsService>;

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

  const mockArea: Partial<PropertyArea> = {
    id: 'area-uuid-1',
    name: 'Downtown Dubai',
    companyId,
  };

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        {
          provide: getRepositoryToken(PropertyArea),
          useValue: createRepositoryMock<PropertyArea>(),
        },
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
    areaRepo = module.get(getRepositoryToken(PropertyArea));
    assetRepo = module.get(getRepositoryToken(Asset));
    unitRepo = module.get(getRepositoryToken(Unit));
    mediaRepo = module.get(getRepositoryToken(PropertyMedia));
    contactRepo = module.get(getRepositoryToken(Contact));
    contactsService = module.get(ContactsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createArea', () => {
    it('creates and returns an area', async () => {
      areaRepo.create.mockReturnValue(mockArea as PropertyArea);
      areaRepo.save.mockResolvedValue(mockArea as PropertyArea);

      const result = await service.createArea(companyId, {
        name: 'Downtown Dubai',
      });

      expect(areaRepo.create).toHaveBeenCalledWith({
        name: 'Downtown Dubai',
        companyId,
      });
      expect(result).toEqual(mockArea);
    });
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
          owner: { firstName: 'Ahmed', phone: '+971501234567', isWhatsapp: true },
        },
        'user-uuid-1',
      );

      expect(contactsService.resolveOrCreate).toHaveBeenCalledWith(
        companyId,
        { firstName: 'Ahmed', phone: '+971501234567', isWhatsapp: true },
        'user-uuid-1',
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
    it('assigns ownerId when a valid ownerId is provided', async () => {
      unitRepo.findOne.mockResolvedValue({ ...mockUnit } as Unit);
      contactRepo.findOne.mockResolvedValue(mockOwner as Contact);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

      const result = await service.updateUnit('unit-uuid-1', companyId, {
        ownerId: 'owner-uuid-1',
      });

      expect(contactRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'owner-uuid-1', companyId },
      });
      expect(unitRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'owner-uuid-1' }),
      );
      expect(result.ownerId).toBe('owner-uuid-1');
    });

    it('clears ownerId when ownerId is set to null', async () => {
      unitRepo.findOne.mockResolvedValue({
        ...mockUnit,
        ownerId: 'owner-uuid-1',
      } as Unit);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

      const result = await service.updateUnit('unit-uuid-1', companyId, {
        ownerId: null,
      });

      expect(contactRepo.findOne).not.toHaveBeenCalled();
      expect(unitRepo.save).toHaveBeenCalledWith(
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
      unitRepo.findOne.mockResolvedValue({ ...mockUnit } as Unit);
      contactsService.resolveOrCreate.mockResolvedValue({
        id: 'owner-uuid-1',
      } as Contact);
      contactRepo.findOne.mockResolvedValue(mockOwner as Contact);
      unitRepo.save.mockImplementation(async (u: Unit) => u);

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
      );
      expect(result.ownerId).toBe('owner-uuid-1');
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

    it('returns error when CSV has no data rows', async () => {
      const csv = 'unitNumber,assetId';
      const result = await service.bulkImportUnits(companyId, csv);

      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
