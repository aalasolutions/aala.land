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
  const mockReq = { user: { companyId, userId: 'user-uuid-1', email: 'admin@test.com', role: 'company_admin' } };

  const mockArea = { id: 'area-uuid-1', name: 'Downtown Dubai', companyId };
  const mockAsset = { id: 'asset-uuid-1', name: 'Burj View', localityId: 'locality-uuid-1', units: [] };
  const mockUnit = { id: 'unit-uuid-1', unitNumber: '1A', assetId: 'asset-uuid-1', companyId };

  const paginatedAreas = { data: [mockArea], total: 1, page: 1, limit: 20 };
  const paginatedAssets = { data: [mockAsset], total: 1, page: 1, limit: 20 };
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
            createAsset: jest.fn(),
            findAssetsByLocality: jest.fn(),
            updateAsset: jest.fn(),
            removeAsset: jest.fn(),
            createUnit: jest.fn(),
            findUnitsByAsset: jest.fn(),
            updateUnit: jest.fn(),
            removeUnit: jest.fn(),
            bulkImportUnits: jest.fn(),
          },
        },
        {
          provide: MediaService,
          useValue: {
            uploadImage: jest.fn(),
            findByUnit: jest.fn(),
            findByAsset: jest.fn(),
            setPrimary: jest.fn(),
            deleteMedia: jest.fn(),
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

  describe('createAsset', () => {
    it('creates asset with companyId from request', async () => {
      service.createAsset.mockResolvedValue(mockAsset as any);

      const result = await controller.createAsset({ name: 'Burj View', localityId: 'locality-uuid-1' }, mockReq);

      expect(service.createAsset).toHaveBeenCalledWith(companyId, { name: 'Burj View', localityId: 'locality-uuid-1' });
      expect(result).toEqual(mockAsset);
    });
  });

  describe('findAssetsByLocality', () => {
    it('returns paginated assets for locality and company', async () => {
      service.findAssetsByLocality.mockResolvedValue(paginatedAssets as any);

      const result = await controller.findAssetsByLocality('locality-uuid-1', mockReq, 1, 20);

      expect(service.findAssetsByLocality).toHaveBeenCalledWith('locality-uuid-1', companyId, 1, 20);
      expect(result).toEqual(paginatedAssets);
    });
  });

  describe('createUnit', () => {
    it('creates unit with companyId from request', async () => {
      service.createUnit.mockResolvedValue(mockUnit as any);

      const result = await controller.createUnit({ unitNumber: '1A', assetId: 'asset-uuid-1' } as any, mockReq);

      expect(service.createUnit).toHaveBeenCalledWith(companyId, { unitNumber: '1A', assetId: 'asset-uuid-1' });
      expect(result).toEqual(mockUnit);
    });
  });

  describe('findUnitsByAsset', () => {
    it('returns paginated units for asset and company', async () => {
      service.findUnitsByAsset.mockResolvedValue(paginatedUnits as any);

      const result = await controller.findUnitsByAsset('asset-uuid-1', mockReq, 1, 20);

      expect(service.findUnitsByAsset).toHaveBeenCalledWith('asset-uuid-1', companyId, 1, 20);
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

  describe('uploadMedia', () => {
    it('calls mediaService.uploadImage with companyId, file, and dto', async () => {
      const mockMedia = {
        id:            'media-uuid-1',
        url:           'https://s3.us-east-005.backblazeb2.com/aala-cloud/companies/c1/photo.jpg',
        thumbnailUrl:  'https://s3.us-east-005.backblazeb2.com/aala-cloud/companies/c1/thumbs/thumb-photo.jpg',
        fileSize:      204800,
        thumbnailSize: 12288,
        companyId,
      };
      mediaService.uploadImage.mockResolvedValue(mockMedia as any);

      const mockFile = {
        buffer:       Buffer.from('fake-image'),
        mimetype:     'image/jpeg',
        originalname: 'photo.jpg',
        size:         204800,
      } as Express.Multer.File;
      const dto = { unitId: 'unit-uuid-1', type: 'image' as any };

      const result = await controller.uploadMedia(mockFile, dto as any, mockReq);

      expect(mediaService.uploadImage).toHaveBeenCalledWith(companyId, mockFile, dto);
      expect(result).toEqual(mockMedia);
    });

    it('throws BadRequestException when no file is provided', async () => {
      await expect(
        controller.uploadMedia(undefined as any, {} as any, mockReq),
      ).rejects.toThrow('No file provided');
    });
  });

  describe('bulkImport', () => {
    it('bulk imports units from CSV', async () => {
      const importResult = { created: 2, failed: 0, errors: [] };
      service.bulkImportUnits.mockResolvedValue(importResult);

      const csv = 'unitNumber,assetId\n101,asset-uuid-1\n102,asset-uuid-1';
      const result = await controller.bulkImport(csv, mockReq);

      expect(service.bulkImportUnits).toHaveBeenCalledWith(companyId, csv);
      expect(result).toEqual(importResult);
    });
  });
});
