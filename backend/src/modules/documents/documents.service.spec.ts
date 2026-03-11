import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import {
  PropertyDocument,
  DocumentCategory,
  DocumentAccessLevel,
} from '../properties/entities/property-document.entity';
import { Role } from '@shared/enums/roles.enum';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let repo: any;

  const companyId = 'company-uuid-1';
  const userId = 'user-uuid-1';

  const mockDoc: Partial<PropertyDocument> = {
    id: 'doc-uuid-1',
    companyId,
    name: 'Lease Agreement.pdf',
    url: 'https://s3.example.com/docs/lease.pdf',
    fileType: 'application/pdf',
    category: DocumentCategory.LEASE,
    accessLevel: DocumentAccessLevel.COMPANY,
    version: 1,
    previousVersionId: null,
    uploadedBy: userId,
    unitId: null,
    buildingId: null,
  };

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    repo = module.get(getRepositoryToken(PropertyDocument));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a document with company and user IDs', async () => {
      repo.create.mockReturnValue(mockDoc);
      repo.save.mockResolvedValue(mockDoc);

      const dto = { name: 'Lease Agreement.pdf', url: 'https://s3.example.com/docs/lease.pdf' };
      const result = await service.create(companyId, userId, dto as any);

      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        companyId,
        uploadedBy: userId,
        version: 1,
      });
      expect(result).toEqual(mockDoc);
    });
  });

  describe('findAll', () => {
    it('returns paginated documents for COMPANY_ADMIN', async () => {
      const result = await service.findAll(companyId, Role.COMPANY_ADMIN, 1, 20);

      expect(result.data).toEqual([mockDoc]);
      expect(result.total).toBe(1);
    });

    it('filters by category when provided', async () => {
      const qb = repo.createQueryBuilder();
      await service.findAll(companyId, Role.COMPANY_ADMIN, 1, 20, DocumentCategory.LEASE);

      expect(qb.andWhere).toHaveBeenCalledWith('doc.category = :category', { category: DocumentCategory.LEASE });
    });
  });

  describe('findOne', () => {
    it('returns document when found', async () => {
      const result = await service.findOne('doc-uuid-1', companyId, Role.COMPANY_ADMIN);
      expect(result).toEqual(mockDoc);
    });

    it('throws NotFoundException when not found', async () => {
      const qb = repo.createQueryBuilder();
      qb.getOne.mockResolvedValue(null);

      await expect(service.findOne('bad-id', companyId, Role.COMPANY_ADMIN)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates document in place when URL does not change', async () => {
      const updated = { ...mockDoc, name: 'Updated Name' };
      repo.save.mockResolvedValue(updated);

      const result = await service.update('doc-uuid-1', companyId, userId, Role.COMPANY_ADMIN, { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('creates new version when URL changes', async () => {
      const newVersion = { ...mockDoc, id: 'doc-uuid-2', version: 2, previousVersionId: 'doc-uuid-1', url: 'https://s3.example.com/docs/lease-v2.pdf' };
      repo.create.mockReturnValue(newVersion);
      repo.save.mockResolvedValue(newVersion);

      const result = await service.update('doc-uuid-1', companyId, userId, Role.COMPANY_ADMIN, { url: 'https://s3.example.com/docs/lease-v2.pdf' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        version: 2,
        previousVersionId: 'doc-uuid-1',
        url: 'https://s3.example.com/docs/lease-v2.pdf',
      }));
      expect(result.version).toBe(2);
    });
  });

  describe('remove', () => {
    it('removes the document', async () => {
      repo.remove.mockResolvedValue(mockDoc);

      await service.remove('doc-uuid-1', companyId, Role.COMPANY_ADMIN);

      expect(repo.remove).toHaveBeenCalledWith(mockDoc);
    });
  });

  describe('access control', () => {
    it('VIEWER only sees PUBLIC documents', async () => {
      await service.findAll(companyId, Role.VIEWER, 1, 20);

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
        { allowedLevels: [DocumentAccessLevel.PUBLIC, DocumentAccessLevel.COMPANY] },
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

  describe('getVersionHistory', () => {
    it('returns version chain', async () => {
      const v1 = { ...mockDoc, id: 'doc-v1', version: 1, previousVersionId: null };
      const v2 = { ...mockDoc, id: 'doc-v2', version: 2, previousVersionId: 'doc-v1' };

      const qb = repo.createQueryBuilder();
      qb.getOne.mockResolvedValue(v2);
      repo.findOne.mockResolvedValue(v1);

      const result = await service.getVersionHistory('doc-v2', companyId, Role.COMPANY_ADMIN);

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
      expect(result[1].version).toBe(1);
    });
  });
});
