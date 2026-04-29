import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PropertiesService } from './properties.service';
import { PropertyArea } from './entities/property-area.entity';
import { Asset } from './entities/asset.entity';
import { Unit } from './entities/unit.entity';
import { Listing } from './entities/listing.entity';
import { PropertyMedia } from './entities/property-media.entity';

describe('PropertiesService', () => {
  let service: PropertiesService;
  let areaRepo: jest.Mocked<Repository<PropertyArea>>;
  let assetRepo: jest.Mocked<Repository<Asset>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;

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
          provide: getRepositoryToken(Listing),
          useValue: createRepositoryMock<Listing>(),
        },
        {
          provide: getRepositoryToken(PropertyMedia),
          useValue: createRepositoryMock<PropertyMedia>(),
        },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
    areaRepo = module.get(getRepositoryToken(PropertyArea));
    assetRepo = module.get(getRepositoryToken(Asset));
    unitRepo = module.get(getRepositoryToken(Unit));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createArea', () => {
    it('creates and returns an area', async () => {
      areaRepo.create.mockReturnValue(mockArea as PropertyArea);
      areaRepo.save.mockResolvedValue(mockArea as PropertyArea);

      const result = await service.createArea(companyId, { name: 'Downtown Dubai' });

      expect(areaRepo.create).toHaveBeenCalledWith({ name: 'Downtown Dubai', companyId });
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
      const uniqueViolation = new QueryFailedError('INSERT INTO buildings ...', [], { code: '23505' });

      assetRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(duplicate);
      assetRepo.create.mockReturnValue({ ...duplicate, id: 'new-asset' } as Asset);
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

      assetRepo.findOne.mockResolvedValueOnce(existingAsset).mockResolvedValueOnce(null);
      assetRepo.save.mockResolvedValue(savedAsset);

      const result = await service.updateAsset('asset-uuid-1', { name: '  Bay   Tower  ' });

      expect(assetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'asset-uuid-1', name: 'Bay Tower' }),
      );
      expect(result).toEqual(savedAsset);
    });

    it('throws NotFoundException when the asset does not exist', async () => {
      assetRepo.findOne.mockResolvedValue(null);

      await expect(service.updateAsset('missing-asset', { name: 'Bay Tower' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('bulkImportUnits', () => {
    it('creates units from valid CSV', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      unitRepo.save.mockResolvedValue([mockUnit] as Unit[]);

      const csv = 'unitNumber,assetId,bedrooms,bathrooms\n101,asset-1,2,1\n102,asset-1,3,2';
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
