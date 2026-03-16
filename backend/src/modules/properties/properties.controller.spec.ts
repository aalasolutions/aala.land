import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('PropertiesController', () => {
  let controller: PropertiesController;
  let service: jest.Mocked<PropertiesService>;
  let mediaService: jest.Mocked<MediaService>;

  const companyId = 'company-uuid-1';
  const mockReq = { user: { companyId } };

  const mockArea = { id: 'area-uuid-1', name: 'Downtown Dubai', companyId, buildings: [] };
  const mockBuilding = { id: 'building-uuid-1', name: 'Burj View', areaId: 'area-uuid-1', companyId, units: [] };
  const mockUnit = { id: 'unit-uuid-1', unitNumber: '1A', buildingId: 'building-uuid-1', companyId };

  const paginatedAreas = { data: [mockArea], total: 1, page: 1, limit: 20 };
  const paginatedBuildings = { data: [mockBuilding], total: 1, page: 1, limit: 20 };
  const paginatedUnits = { data: [mockUnit], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PropertiesController],
      providers: [
        {
          provide: PropertiesService,
          useValue: {
            createArea: jest.fn(),
            findAllAreas: jest.fn(),
            findOneArea: jest.fn(),
            updateArea: jest.fn(),
            removeArea: jest.fn(),
            createBuilding: jest.fn(),
            findBuildingsByArea: jest.fn(),
            updateBuilding: jest.fn(),
            removeBuilding: jest.fn(),
            createUnit: jest.fn(),
            findUnitsByBuilding: jest.fn(),
            updateUnit: jest.fn(),
            removeUnit: jest.fn(),
            bulkImportUnits: jest.fn(),
          },
        },
        {
          provide: MediaService,
          useValue: {
            getPresignedUploadUrl: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PropertiesController>(PropertiesController);
    service = module.get(PropertiesService);
    mediaService = module.get(MediaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createArea', () => {
    it('creates area with companyId from request', async () => {
      service.createArea.mockResolvedValue(mockArea as any);

      const result = await controller.createArea({ name: 'Downtown Dubai' }, mockReq);

      expect(service.createArea).toHaveBeenCalledWith(companyId, { name: 'Downtown Dubai' });
      expect(result).toEqual(mockArea);
    });
  });

  describe('findAllAreas', () => {
    it('returns paginated areas for company', async () => {
      service.findAllAreas.mockResolvedValue(paginatedAreas as any);

      const result = await controller.findAllAreas(mockReq, 1, 20);

      expect(service.findAllAreas).toHaveBeenCalledWith(companyId, 1, 20, undefined);
      expect(result).toEqual(paginatedAreas);
    });
  });

  describe('createBuilding', () => {
    it('creates building with companyId from request', async () => {
      service.createBuilding.mockResolvedValue(mockBuilding as any);

      const result = await controller.createBuilding({ name: 'Burj View', areaId: 'area-uuid-1' }, mockReq);

      expect(service.createBuilding).toHaveBeenCalledWith(companyId, { name: 'Burj View', areaId: 'area-uuid-1' });
      expect(result).toEqual(mockBuilding);
    });
  });

  describe('findBuildings', () => {
    it('returns paginated buildings for area and company', async () => {
      service.findBuildingsByArea.mockResolvedValue(paginatedBuildings as any);

      const result = await controller.findBuildings('area-uuid-1', mockReq, 1, 20);

      expect(service.findBuildingsByArea).toHaveBeenCalledWith('area-uuid-1', companyId, 1, 20);
      expect(result).toEqual(paginatedBuildings);
    });
  });

  describe('createUnit', () => {
    it('creates unit with companyId from request', async () => {
      service.createUnit.mockResolvedValue(mockUnit as any);

      const result = await controller.createUnit({ unitNumber: '1A', buildingId: 'building-uuid-1' }, mockReq);

      expect(service.createUnit).toHaveBeenCalledWith(companyId, { unitNumber: '1A', buildingId: 'building-uuid-1' });
      expect(result).toEqual(mockUnit);
    });
  });

  describe('findUnits', () => {
    it('returns paginated units for building and company', async () => {
      service.findUnitsByBuilding.mockResolvedValue(paginatedUnits as any);

      const result = await controller.findUnits('building-uuid-1', mockReq, 1, 20);

      expect(service.findUnitsByBuilding).toHaveBeenCalledWith('building-uuid-1', companyId, 1, 20);
      expect(result).toEqual(paginatedUnits);
    });
  });

  describe('updateArea', () => {
    it('updates area', async () => {
      service.updateArea.mockResolvedValue({ ...mockArea, name: 'Updated' } as any);

      const result = await controller.updateArea('area-uuid-1', { name: 'Updated' }, mockReq);

      expect(service.updateArea).toHaveBeenCalledWith('area-uuid-1', companyId, { name: 'Updated' });
    });
  });

  describe('removeArea', () => {
    it('removes area', async () => {
      service.removeArea.mockResolvedValue(undefined);

      await controller.removeArea('area-uuid-1', mockReq);

      expect(service.removeArea).toHaveBeenCalledWith('area-uuid-1', companyId);
    });
  });

  describe('getPresignedUrl', () => {
    it('returns presigned URL for upload', async () => {
      const mockResult = {
        uploadUrl: 'https://bucket.s3.amazonaws.com/...',
        fileUrl: 'https://bucket.s3.amazonaws.com/path/file.jpg',
        key: 'companies/company-uuid-1/properties/unit-1/file.jpg',
        expiresIn: 300,
      };
      mediaService.getPresignedUploadUrl.mockResolvedValue(mockResult);

      const dto = { fileName: 'photo.jpg', contentType: 'image/jpeg' };
      const result = await controller.getPresignedUrl(dto as any, mockReq);

      expect(mediaService.getPresignedUploadUrl).toHaveBeenCalledWith(companyId, dto);
      expect(result).toEqual(mockResult);
    });
  });

  describe('bulkImport', () => {
    it('bulk imports units from CSV', async () => {
      const importResult = { created: 2, failed: 0, errors: [] };
      service.bulkImportUnits.mockResolvedValue(importResult);

      const csv = 'unitNumber,buildingId\n101,building-uuid-1\n102,building-uuid-1';
      const result = await controller.bulkImport(csv, mockReq);

      expect(service.bulkImportUnits).toHaveBeenCalledWith(companyId, csv);
      expect(result).toEqual(importResult);
    });
  });
});
