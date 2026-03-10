import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PropertyArea } from './entities/property-area.entity';
import { Building } from './entities/building.entity';
import { Unit } from './entities/unit.entity';

describe('PropertiesService', () => {
  let service: PropertiesService;
  let areaRepo: jest.Mocked<Repository<PropertyArea>>;
  let buildingRepo: jest.Mocked<Repository<Building>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;

  const companyId = 'company-uuid-1';

  const mockArea: Partial<PropertyArea> = {
    id: 'area-uuid-1',
    name: 'Downtown Dubai',
    companyId,
    buildings: [],
  };

  const mockBuilding: Partial<Building> = {
    id: 'building-uuid-1',
    name: 'Burj View Tower',
    areaId: 'area-uuid-1',
    companyId,
    units: [],
  };

  const mockUnit: Partial<Unit> = {
    id: 'unit-uuid-1',
    unitNumber: '1A',
    buildingId: 'building-uuid-1',
    companyId,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        {
          provide: getRepositoryToken(PropertyArea),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Building),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
    areaRepo = module.get(getRepositoryToken(PropertyArea));
    buildingRepo = module.get(getRepositoryToken(Building));
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

  describe('findAllAreas', () => {
    it('returns paginated areas for company', async () => {
      areaRepo.findAndCount.mockResolvedValue([[mockArea as PropertyArea], 1]);

      const result = await service.findAllAreas(companyId, 1, 20);

      expect(areaRepo.findAndCount).toHaveBeenCalledWith({
        where: { companyId },
        relations: ['buildings'],
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockArea]);
      expect(result.total).toBe(1);
    });
  });

  describe('findOneArea', () => {
    it('returns area when found', async () => {
      areaRepo.findOne.mockResolvedValue(mockArea as PropertyArea);

      const result = await service.findOneArea('area-uuid-1', companyId);

      expect(result).toEqual(mockArea);
    });

    it('throws NotFoundException when area not found', async () => {
      areaRepo.findOne.mockResolvedValue(null);

      await expect(service.findOneArea('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateArea', () => {
    it('updates area', async () => {
      areaRepo.findOne.mockResolvedValue(mockArea as PropertyArea);
      areaRepo.save.mockResolvedValue({ ...mockArea, name: 'Updated' } as PropertyArea);

      const result = await service.updateArea('area-uuid-1', companyId, { name: 'Updated' });

      expect(result.name).toBe('Updated');
    });
  });

  describe('removeArea', () => {
    it('removes area', async () => {
      areaRepo.findOne.mockResolvedValue(mockArea as PropertyArea);
      areaRepo.remove.mockResolvedValue(mockArea as PropertyArea);

      await service.removeArea('area-uuid-1', companyId);

      expect(areaRepo.remove).toHaveBeenCalledWith(mockArea);
    });
  });

  describe('createBuilding', () => {
    it('creates and returns a building', async () => {
      buildingRepo.create.mockReturnValue(mockBuilding as Building);
      buildingRepo.save.mockResolvedValue(mockBuilding as Building);

      const result = await service.createBuilding(companyId, { name: 'Burj View Tower', areaId: 'area-uuid-1' });

      expect(result).toEqual(mockBuilding);
    });
  });

  describe('findBuildingsByArea', () => {
    it('returns paginated buildings for area and company', async () => {
      buildingRepo.findAndCount.mockResolvedValue([[mockBuilding as Building], 1]);

      const result = await service.findBuildingsByArea('area-uuid-1', companyId, 1, 20);

      expect(buildingRepo.findAndCount).toHaveBeenCalledWith({
        where: { areaId: 'area-uuid-1', companyId },
        relations: ['units'],
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockBuilding]);
    });
  });

  describe('createUnit', () => {
    it('creates and returns a unit', async () => {
      unitRepo.create.mockReturnValue(mockUnit as Unit);
      unitRepo.save.mockResolvedValue(mockUnit as Unit);

      const result = await service.createUnit(companyId, { unitNumber: '1A', buildingId: 'building-uuid-1' });

      expect(result).toEqual(mockUnit);
    });
  });

  describe('findUnitsByBuilding', () => {
    it('returns paginated units for building and company', async () => {
      unitRepo.findAndCount.mockResolvedValue([[mockUnit as Unit], 1]);

      const result = await service.findUnitsByBuilding('building-uuid-1', companyId, 1, 20);

      expect(unitRepo.findAndCount).toHaveBeenCalledWith({
        where: { buildingId: 'building-uuid-1', companyId },
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
      expect(result.data).toEqual([mockUnit]);
    });
  });

  describe('findOneUnit', () => {
    it('returns unit when found', async () => {
      unitRepo.findOne.mockResolvedValue(mockUnit as Unit);

      const result = await service.findOneUnit('unit-uuid-1', companyId);

      expect(result).toEqual(mockUnit);
    });

    it('throws NotFoundException when unit not found', async () => {
      unitRepo.findOne.mockResolvedValue(null);

      await expect(service.findOneUnit('bad-id', companyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkImportUnits', () => {
    it('creates units from valid CSV', async () => {
      unitRepo.create.mockImplementation((data) => data as Unit);
      unitRepo.save.mockResolvedValue({} as Unit);

      const csv = 'unitNumber,buildingId,bedrooms,bathrooms\n101,building-1,2,1\n102,building-1,3,2';
      const result = await service.bulkImportUnits(companyId, csv);

      expect(result.created).toBe(2);
      expect(result.failed).toBe(0);
      expect(unitRepo.save).toHaveBeenCalledTimes(2);
    });

    it('reports error for rows missing required fields', async () => {
      const csv = 'unitNumber,buildingId\n,building-1\n102,';
      const result = await service.bulkImportUnits(companyId, csv);

      expect(result.failed).toBe(2);
      expect(result.errors.length).toBe(2);
    });

    it('returns error when CSV has no data rows', async () => {
      const csv = 'unitNumber,buildingId';
      const result = await service.bulkImportUnits(companyId, csv);

      expect(result.created).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
