import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import {
  PropertyDocument,
  DocumentAccessLevel,
} from '../properties/entities/property-document.entity';
import { MediaService } from '../properties/media.service';
import { Role } from '@shared/enums/roles.enum';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let repo: any;
  let mockMediaService: jest.Mocked<
    Pick<
      MediaService,
      | 'uploadDocumentToStorage'
      | 'deleteDocumentFromStorage'
      | 'getDocumentStream'
    >
  >;

  const companyId = 'company-uuid-1';
  const userId = 'user-uuid-1';

  const mockDoc: Partial<PropertyDocument> = {
    id: 'doc-uuid-1',
    companyId,
    name: 'Lease Agreement.pdf',
    url: 'https://s3.example.com/docs/lease.pdf',
    s3Key: 'companies/company-uuid-1/documents/123-lease.pdf',
    fileSize: 51200,
    fileType: 'application/pdf',
    category: 'LEASE',
    accessLevel: DocumentAccessLevel.COMPANY,
    version: 1,
    previousVersionId: null,
    uploadedBy: userId,
    unitId: null,
    assetId: null,
  };

  beforeEach(async () => {
    mockMediaService = {
      uploadDocumentToStorage: jest.fn(),
      deleteDocumentFromStorage: jest.fn(),
      getDocumentStream: jest.fn(),
    };

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockDoc], 1]),
      getOne: jest.fn().mockResolvedValue(mockDoc),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getRepositoryToken(PropertyDocument),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: MediaService,
          useValue: mockMediaService,
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    repo = module.get(getRepositoryToken(PropertyDocument));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadAndCreate', () => {
    it('calls mediaService.uploadDocumentToStorage and creates a document record', async () => {
      const mockUploadResult = {
        url: 'https://s3.us-east-005.backblazeb2.com/aala-cloud/companies/c1/doc.pdf',
        s3Key: 'companies/c1/documents/123-doc.pdf',
        fileSize: 51200,
      };
      mockMediaService.uploadDocumentToStorage.mockResolvedValue(
        mockUploadResult,
      );

      repo.create.mockReturnValue(mockDoc);
      repo.save.mockResolvedValue(mockDoc);

      const mockFile = {
        buffer: Buffer.from('pdf'),
        mimetype: 'application/pdf',
        originalname: 'contract.pdf',
        size: 51200,
      } as Express.Multer.File;
      const dto = { name: 'Service Contract', category: 'LEASE' };

      const result = await service.uploadAndCreate(
        companyId,
        userId,
        mockFile,
        dto as any,
      );

      expect(mockMediaService.uploadDocumentToStorage).toHaveBeenCalledWith(
        companyId,
        mockFile,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Service Contract',
          url: mockUploadResult.url,
          s3Key: mockUploadResult.s3Key,
          fileSize: mockUploadResult.fileSize,
          companyId,
          uploadedBy: userId,
          version: 1,
        }),
      );
      expect(result).toEqual(mockDoc);
    });
  });

  describe('findAll', () => {
    it('returns paginated documents for COMPANY_ADMIN', async () => {
      const result = await service.findAll(
        companyId,
        Role.COMPANY_ADMIN,
        1,
        20,
      );

      expect(result.data).toEqual([mockDoc]);
      expect(result.total).toBe(1);
    });

    it('filters by category when provided', async () => {
      const qb = repo.createQueryBuilder();
      await service.findAll(companyId, Role.COMPANY_ADMIN, 1, 20, 'LEASE');

      expect(qb.andWhere).toHaveBeenCalledWith('doc.category = :category', {
        category: 'LEASE',
      });
    });
  });

  describe('findOne', () => {
    it('returns document when found', async () => {
      const result = await service.findOne(
        'doc-uuid-1',
        companyId,
        Role.COMPANY_ADMIN,
      );
      expect(result).toEqual(mockDoc);
    });

    it('throws NotFoundException when not found', async () => {
      const qb = repo.createQueryBuilder();
      qb.getOne.mockResolvedValue(null);

      await expect(
        service.findOne('bad-id', companyId, Role.COMPANY_ADMIN),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates document metadata in place', async () => {
      const updated = { ...mockDoc, name: 'Updated Name' };
      repo.save.mockResolvedValue(updated);

      const result = await service.update(
        'doc-uuid-1',
        companyId,
        Role.COMPANY_ADMIN,
        { name: 'Updated Name' },
      );

      expect(result.name).toBe('Updated Name');
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('calls deleteDocumentFromStorage when s3Key is present, then removes record', async () => {
      mockMediaService.deleteDocumentFromStorage.mockResolvedValue(undefined);
      repo.remove.mockResolvedValue(mockDoc);

      await service.remove('doc-uuid-1', companyId, Role.COMPANY_ADMIN);

      expect(mockMediaService.deleteDocumentFromStorage).toHaveBeenCalledWith(
        mockDoc.s3Key,
        companyId,
        mockDoc.fileSize,
      );
      expect(repo.remove).toHaveBeenCalledWith(mockDoc);
    });

    it('skips storage cleanup when s3Key is absent', async () => {
      const docWithoutKey = { ...mockDoc, s3Key: null };
      const qb = repo.createQueryBuilder();
      qb.getOne.mockResolvedValue(docWithoutKey);
      repo.remove.mockResolvedValue(docWithoutKey);

      await service.remove('doc-uuid-1', companyId, Role.COMPANY_ADMIN);

      expect(mockMediaService.deleteDocumentFromStorage).not.toHaveBeenCalled();
      expect(repo.remove).toHaveBeenCalledWith(docWithoutKey);
    });
  });

  describe('access control', () => {
    it('ACCOUNTANT only sees PUBLIC documents', async () => {
      await service.findAll(companyId, Role.ACCOUNTANT, 1, 20);

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        { allowedLevels: [DocumentAccessLevel.PUBLIC] },
      );
    });

    it('AGENT sees PUBLIC and COMPANY documents', async () => {
      await service.findAll(companyId, Role.AGENT, 1, 20);

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        {
          allowedLevels: [
            DocumentAccessLevel.PUBLIC,
            DocumentAccessLevel.COMPANY,
          ],
        },
      );
    });

    it('MANAGER sees PUBLIC and COMPANY documents', async () => {
      await service.findAll(companyId, Role.MANAGER, 1, 20);

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        {
          allowedLevels: [
            DocumentAccessLevel.PUBLIC,
            DocumentAccessLevel.COMPANY,
          ],
        },
      );
    });

    it('ADMIN sees PUBLIC, COMPANY, and ADMIN_ONLY documents', async () => {
      await service.findAll(companyId, Role.ADMIN, 1, 20);

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        {
          allowedLevels: [
            DocumentAccessLevel.PUBLIC,
            DocumentAccessLevel.COMPANY,
            DocumentAccessLevel.ADMIN_ONLY,
          ],
        },
      );
    });

    it('COMPANY_ADMIN sees PUBLIC, COMPANY, and ADMIN_ONLY documents', async () => {
      await service.findAll(companyId, Role.COMPANY_ADMIN, 1, 20);

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        {
          allowedLevels: [
            DocumentAccessLevel.PUBLIC,
            DocumentAccessLevel.COMPANY,
            DocumentAccessLevel.ADMIN_ONLY,
          ],
        },
      );
    });

    it('SUPER_ADMIN sees all access levels', async () => {
      await service.findAll(companyId, Role.SUPER_ADMIN, 1, 20);

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        {
          allowedLevels: [
            DocumentAccessLevel.PUBLIC,
            DocumentAccessLevel.COMPANY,
            DocumentAccessLevel.OWNER_ONLY,
            DocumentAccessLevel.ADMIN_ONLY,
          ],
        },
      );
    });
  });

  describe('downloadStream', () => {
    it('re-checks access via findOne and returns the media stream', async () => {
      const fakeStream = {} as NodeJS.ReadableStream;
      mockMediaService.getDocumentStream.mockResolvedValue(fakeStream);

      const result = await service.downloadStream(
        'doc-uuid-1',
        companyId,
        Role.COMPANY_ADMIN,
      );

      expect(mockMediaService.getDocumentStream).toHaveBeenCalledWith(
        mockDoc.s3Key,
      );
      expect(result.stream).toBe(fakeStream);
      expect(result.doc).toEqual(mockDoc);
    });

    it('throws NotFoundException when the caller role cannot see the document (accessLevel filtered)', async () => {
      const qb = repo.createQueryBuilder();
      qb.getOne.mockResolvedValue(null);

      await expect(
        service.downloadStream('doc-uuid-1', companyId, Role.ACCOUNTANT),
      ).rejects.toThrow(NotFoundException);
      expect(mockMediaService.getDocumentStream).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the document has no s3Key', async () => {
      const qb = repo.createQueryBuilder();
      qb.getOne.mockResolvedValue({ ...mockDoc, s3Key: null });

      await expect(
        service.downloadStream('doc-uuid-1', companyId, Role.COMPANY_ADMIN),
      ).rejects.toThrow(NotFoundException);
      expect(mockMediaService.getDocumentStream).not.toHaveBeenCalled();
    });
  });

  describe('getVersionHistory', () => {
    it('returns version chain', async () => {
      const v1 = {
        ...mockDoc,
        id: 'doc-v1',
        version: 1,
        previousVersionId: null,
      };
      const v2 = {
        ...mockDoc,
        id: 'doc-v2',
        version: 2,
        previousVersionId: 'doc-v1',
      };

      const qb = repo.createQueryBuilder();
      qb.getOne.mockResolvedValue(v2);
      repo.findOne.mockResolvedValue(v1);

      const result = await service.getVersionHistory(
        'doc-v2',
        companyId,
        Role.COMPANY_ADMIN,
      );

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
      expect(result[1].version).toBe(1);
    });
  });
});
