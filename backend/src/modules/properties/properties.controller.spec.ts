import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PropertiesController } from './properties.controller';
import {
  OptionalPropertyReasonDto,
  PropertyReasonDto,
} from './dto/property-reason.dto';
import { UnitArchivedFilter } from './dto/unit-archived-filter.enum';
import { PropertiesService } from './properties.service';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('PropertiesController', () => {
  let controller: PropertiesController;
  let service: jest.Mocked<PropertiesService>;
  let mediaService: jest.Mocked<MediaService>;

  const companyId = 'company-uuid-1';
  const userId = 'user-uuid-1';
  const mockReq = {
    user: {
      companyId,
      userId,
      email: 'admin@test.com',
      role: 'company_admin',
      regionCodes: ['dubai'],
    },
  };

  const mockAsset = {
    id: 'asset-uuid-1',
    name: 'Burj View',
    localityId: 'locality-uuid-1',
    units: [],
  };
  const mockUnit = {
    id: 'unit-uuid-1',
    unitNumber: '1A',
    assetId: 'asset-uuid-1',
    companyId,
  };

  const paginatedAssets = { data: [mockAsset], total: 1, page: 1, limit: 20 };
  const paginatedUnits = { data: [mockUnit], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PropertiesController],
      providers: [
        {
          provide: PropertiesService,
          useValue: {
            createAsset: jest.fn(),
            findAssetsByLocality: jest.fn(),
            findOneAsset: jest.fn(),
            updateAsset: jest.fn(),
            removeAsset: jest.fn(),
            createUnit: jest.fn(),
            findOneUnit: jest.fn(),
            findUnitsByAsset: jest.fn(),
            updateUnit: jest.fn(),
            removeUnit: jest.fn(),
            archiveUnit: jest.fn(),
            unarchiveUnit: jest.fn(),
            findAllUnits: jest.fn(),
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

  describe('createAsset', () => {
    it('creates asset with companyId from request', async () => {
      service.createAsset.mockResolvedValue(mockAsset as any);

      const result = await controller.createAsset(
        { name: 'Burj View', localityId: 'locality-uuid-1' },
        mockReq,
      );

      expect(service.createAsset).toHaveBeenCalledWith(companyId, {
        name: 'Burj View',
        localityId: 'locality-uuid-1',
      });
      expect(result).toEqual(mockAsset);
    });
  });

  describe('findAssetsByLocality', () => {
    it('returns paginated assets for locality and company', async () => {
      service.findAssetsByLocality.mockResolvedValue(paginatedAssets as any);

      const result = await controller.findAssetsByLocality(
        'locality-uuid-1',
        mockReq,
        1,
        20,
      );

      expect(service.findAssetsByLocality).toHaveBeenCalledWith(
        'locality-uuid-1',
        companyId,
        1,
        20,
        mockReq.user,
        undefined,
      );
      expect(result).toEqual(paginatedAssets);
    });

    it('forwards the regionCode query param', async () => {
      service.findAssetsByLocality.mockResolvedValue(paginatedAssets as any);

      await controller.findAssetsByLocality(
        'locality-uuid-1',
        mockReq,
        1,
        20,
        'makkah',
      );

      expect(service.findAssetsByLocality).toHaveBeenCalledWith(
        'locality-uuid-1',
        companyId,
        1,
        20,
        mockReq.user,
        'makkah',
      );
    });
  });

  describe('createUnit', () => {
    it('creates unit with companyId from request', async () => {
      service.createUnit.mockResolvedValue(mockUnit as any);

      const result = await controller.createUnit(
        { unitNumber: '1A', assetId: 'asset-uuid-1' } as any,
        mockReq,
      );

      expect(service.createUnit).toHaveBeenCalledWith(
        companyId,
        {
          unitNumber: '1A',
          assetId: 'asset-uuid-1',
        },
        userId,
        mockReq.user,
      );
      expect(result).toEqual(mockUnit);
    });
  });

  describe('findUnitsByAsset', () => {
    it('returns paginated units for asset and company', async () => {
      service.findUnitsByAsset.mockResolvedValue(paginatedUnits as any);

      const result = await controller.findUnitsByAsset(
        'asset-uuid-1',
        mockReq,
        1,
        20,
      );

      expect(service.findUnitsByAsset).toHaveBeenCalledWith(
        'asset-uuid-1',
        companyId,
        1,
        20,
        mockReq.user,
        undefined,
        undefined,
      );
      expect(result).toEqual(paginatedUnits);
    });

    it('forwards the archived and regionCode query params', async () => {
      service.findUnitsByAsset.mockResolvedValue(paginatedUnits as any);

      await controller.findUnitsByAsset(
        'asset-uuid-1',
        mockReq,
        1,
        20,
        UnitArchivedFilter.ONLY,
        'makkah',
      );

      expect(service.findUnitsByAsset).toHaveBeenCalledWith(
        'asset-uuid-1',
        companyId,
        1,
        20,
        mockReq.user,
        UnitArchivedFilter.ONLY,
        'makkah',
      );
    });
  });

  describe('region set threading', () => {
    it('findOneAsset passes the caller region set to the service', async () => {
      service.findOneAsset.mockResolvedValue(mockAsset as any);

      await controller.findOneAsset('asset-uuid-1', mockReq);

      expect(service.findOneAsset).toHaveBeenCalledWith(
        'asset-uuid-1',
        companyId,
        mockReq.user,
      );
    });

    it('findOneUnit passes the caller region set to the service', async () => {
      service.findOneUnit.mockResolvedValue(mockUnit as any);

      await controller.findOneUnit('unit-uuid-1', mockReq);

      expect(service.findOneUnit).toHaveBeenCalledWith(
        'unit-uuid-1',
        companyId,
        mockReq.user,
      );
    });

    it('updateUnit passes the caller region set to the service', async () => {
      service.updateUnit.mockResolvedValue(mockUnit as any);

      await controller.updateUnit('unit-uuid-1', { floor: '3' }, mockReq);

      expect(service.updateUnit).toHaveBeenCalledWith(
        'unit-uuid-1',
        companyId,
        { floor: '3' },
        userId,
        mockReq.user,
      );
    });

    it('removeUnit passes the reason, actor and caller region set to the service', async () => {
      service.removeUnit.mockResolvedValue(undefined);

      await controller.removeUnit(
        'unit-uuid-1',
        { reason: 'Mistake' },
        mockReq,
      );

      expect(service.removeUnit).toHaveBeenCalledWith(
        'unit-uuid-1',
        companyId,
        'Mistake',
        userId,
        mockReq.user,
      );
    });

    it('archiveUnit passes the reason and actor to the service', async () => {
      service.archiveUnit.mockResolvedValue(mockUnit as any);

      await controller.archiveUnit('unit-uuid-1', { reason: 'Sold' }, mockReq);

      expect(service.archiveUnit).toHaveBeenCalledWith(
        'unit-uuid-1',
        companyId,
        'Sold',
        userId,
        mockReq.user,
      );
    });

    it('unarchiveUnit accepts a missing reason', async () => {
      service.unarchiveUnit.mockResolvedValue(mockUnit as any);

      await controller.unarchiveUnit('unit-uuid-1', {}, mockReq);

      expect(service.unarchiveUnit).toHaveBeenCalledWith(
        'unit-uuid-1',
        companyId,
        undefined,
        userId,
        mockReq.user,
      );
    });
  });

  describe('removeAsset', () => {
    it('passes the reason and actor to the service', async () => {
      service.removeAsset.mockResolvedValue(undefined);

      await controller.removeAsset(
        'asset-uuid-1',
        { reason: 'Duplicate' },
        mockReq,
      );

      expect(service.removeAsset).toHaveBeenCalledWith(
        'asset-uuid-1',
        'Duplicate',
        userId,
      );
    });
  });

  describe('findAllUnits archived filter', () => {
    it('forwards the archived query param', async () => {
      service.findAllUnits.mockResolvedValue(paginatedUnits as any);

      await controller.findAllUnits(
        mockReq,
        1,
        20,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        UnitArchivedFilter.ONLY,
      );

      expect(service.findAllUnits).toHaveBeenCalledWith(
        companyId,
        1,
        20,
        expect.objectContaining({ archived: UnitArchivedFilter.ONLY }),
        expect.anything(),
      );
    });
  });

  describe('reason DTOs', () => {
    const errorsFor = async (cls: any, body: object) =>
      validate(plainToInstance(cls, body) as object);

    it('rejects a missing or whitespace-only reason', async () => {
      expect(await errorsFor(PropertyReasonDto, {})).not.toHaveLength(0);
      expect(
        await errorsFor(PropertyReasonDto, { reason: '   ' }),
      ).not.toHaveLength(0);
    });

    it('rejects a reason over 500 characters', async () => {
      expect(
        await errorsFor(PropertyReasonDto, { reason: 'x'.repeat(501) }),
      ).not.toHaveLength(0);
    });

    it('trims and accepts a valid reason', async () => {
      const dto = plainToInstance(PropertyReasonDto, { reason: '  Sold  ' });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.reason).toBe('Sold');
    });

    it('allows unarchive without a reason', async () => {
      expect(await errorsFor(OptionalPropertyReasonDto, {})).toHaveLength(0);
    });
  });

  describe('uploadMedia', () => {
    it('calls mediaService.uploadImage with companyId, file, and dto', async () => {
      const mockMedia = {
        id: 'media-uuid-1',
        url: 'https://storage.example.com/test-bucket/companies/c1/photo.jpg',
        thumbnailUrl:
          'https://storage.example.com/test-bucket/companies/c1/thumbs/thumb-photo.jpg',
        fileSize: 204800,
        thumbnailSize: 12288,
        companyId,
      };
      mediaService.uploadImage.mockResolvedValue(mockMedia as any);

      const mockFile = {
        buffer: Buffer.from('fake-image'),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
        size: 204800,
      } as Express.Multer.File;
      const dto = { unitId: 'unit-uuid-1', type: 'image' as any };

      const result = await controller.uploadMedia(
        mockFile,
        dto as any,
        mockReq,
      );

      expect(mediaService.uploadImage).toHaveBeenCalledWith(
        companyId,
        mockFile,
        dto,
      );
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

      expect(service.bulkImportUnits).toHaveBeenCalledWith(
        companyId,
        csv,
        mockReq.user,
      );
      expect(result).toEqual(importResult);
    });
  });
});
