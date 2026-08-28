import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import {
  PropertyDocument,
  DocumentCategory,
  DocumentAccessLevel,
} from '../properties/entities/property-document.entity';
import { Unit } from '../properties/entities/unit.entity';
import { Asset } from '../properties/entities/asset.entity';
import { User } from '../users/entities/user.entity';
import { MediaService } from '../properties/media.service';
import { Role } from '@shared/enums/roles.enum';
import { Company } from '../companies/entities/company.entity';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let repo: any;
  let unitQb: any;
  let assetQb: any;
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
  const callerRegions = ['dubai'];

  const mockDoc: Partial<PropertyDocument> = {
    id: 'doc-uuid-1',
    companyId,
    name: 'Lease Agreement.pdf',
    url: 'https://s3.example.com/docs/lease.pdf',
    s3Key: 'companies/company-uuid-1/documents/123-lease.pdf',
    fileSize: 51200,
    fileType: 'application/pdf',
    category: DocumentCategory.LEASE,
    accessLevel: DocumentAccessLevel.TEAM,
    version: 1,
    previousVersionId: null,
    uploadedBy: userId,
    unitId: null,
    assetId: null,
  };

  // Client-facing shape: the service strips the private storage pointers
  // (url, s3Key) from every document it returns to a caller.
  const sanitizedMockDoc: Partial<PropertyDocument> = { ...mockDoc };
  delete sanitizedMockDoc.url;
  delete sanitizedMockDoc.s3Key;

  beforeEach(async () => {
    mockMediaService = {
      uploadDocumentToStorage: jest.fn(),
      deleteDocumentFromStorage: jest.fn(),
      getDocumentStream: jest.fn(),
    };

    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockDoc], 1]),
      getOne: jest.fn().mockResolvedValue(mockDoc),
    };

    // getRawOne resolves only when the company predicate was bound, so a
    // lookup that skips the company scope returns nothing.
    const propertyChainQb = () => {
      const qb: any = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(async () =>
          qb.scopedCompanyId === companyId ? qb.row : undefined,
        ),
        row: undefined,
        scopedCompanyId: undefined,
      };
      qb.andWhere = jest.fn((_sql: string, params: any) => {
        if (params?.companyId) qb.scopedCompanyId = params.companyId;
        return qb;
      });
      return qb;
    };
    unitQb = propertyChainQb();
    assetQb = propertyChainQb();

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
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(unitQb),
          },
        },
        {
          provide: getRepositoryToken(Asset),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(assetQb),
          },
        },
        {
          provide: getRepositoryToken(Company),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              defaultRegionCode: 'dubai',
              activeRegions: ['dubai', 'makkah', 'punjab'],
            }),
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
      const dto = {
        name: 'Service Contract',
        category: DocumentCategory.LEASE,
      };

      const result = await service.uploadAndCreate(
        companyId,
        userId,
        mockFile,
        dto as any,
        { role: Role.COMPANY_ADMIN, regionCodes: callerRegions },
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
      expect(result).toEqual(sanitizedMockDoc);
      expect(result).not.toHaveProperty('url');
      expect(result).not.toHaveProperty('s3Key');
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

      expect(result.data).toEqual([
        { ...sanitizedMockDoc, uploadedByName: null, unit: null },
      ]);
      expect(result.data[0]).not.toHaveProperty('s3Key');
      expect(result.total).toBe(1);
    });

    it('filters by category when provided', async () => {
      const qb = repo.createQueryBuilder();
      await service.findAll(
        companyId,
        Role.COMPANY_ADMIN,
        1,
        20,
        DocumentCategory.LEASE,
      );

      expect(qb.andWhere).toHaveBeenCalledWith('doc.category = :category', {
        category: DocumentCategory.LEASE,
      });
    });

    it('filters by accessLevel when provided', async () => {
      const qb = repo.createQueryBuilder();
      await service.findAll(
        companyId,
        Role.COMPANY_ADMIN,
        1,
        20,
        undefined,
        undefined,
        { accessLevel: DocumentAccessLevel.ADMIN },
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level = :accessLevel',
        { accessLevel: DocumentAccessLevel.ADMIN },
      );
    });

    it('filters by search against the document name', async () => {
      const qb = repo.createQueryBuilder();
      await service.findAll(
        companyId,
        Role.COMPANY_ADMIN,
        1,
        20,
        undefined,
        undefined,
        { search: 'lease' },
      );

      expect(qb.andWhere).toHaveBeenCalledWith('doc.name ILIKE :search', {
        search: '%lease%',
      });
    });

    it('filters by dateFrom', async () => {
      const qb = repo.createQueryBuilder();
      await service.findAll(
        companyId,
        Role.COMPANY_ADMIN,
        1,
        20,
        undefined,
        undefined,
        { dateFrom: '2026-01-01' },
      );

      expect(qb.andWhere).toHaveBeenCalledWith('doc.created_at >= :dateFrom', {
        dateFrom: '2026-01-01',
      });
    });

    it('filters by dateTo inclusively (through the end of that day)', async () => {
      const qb = repo.createQueryBuilder();
      await service.findAll(
        companyId,
        Role.COMPANY_ADMIN,
        1,
        20,
        undefined,
        undefined,
        { dateTo: '2026-01-31' },
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        "doc.created_at < :dateTo::date + interval '1 day'",
        { dateTo: '2026-01-31' },
      );
    });

    it('combines category, accessLevel, search and date range filters together', async () => {
      const qb = repo.createQueryBuilder();
      await service.findAll(
        companyId,
        Role.COMPANY_ADMIN,
        1,
        20,
        DocumentCategory.LEASE,
        undefined,
        {
          accessLevel: DocumentAccessLevel.TEAM,
          search: 'contract',
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
        },
      );

      expect(qb.andWhere).toHaveBeenCalledWith('doc.category = :category', {
        category: DocumentCategory.LEASE,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level = :accessLevel',
        { accessLevel: DocumentAccessLevel.TEAM },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('doc.name ILIKE :search', {
        search: '%contract%',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('doc.created_at >= :dateFrom', {
        dateFrom: '2026-01-01',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        "doc.created_at < :dateTo::date + interval '1 day'",
        { dateTo: '2026-01-31' },
      );
    });
  });

  describe('findOne', () => {
    it('returns document when found, with storage pointers stripped', async () => {
      const result = await service.findOne(
        'doc-uuid-1',
        companyId,
        Role.COMPANY_ADMIN,
        callerRegions,
      );
      expect(result).toEqual(sanitizedMockDoc);
      expect(result).not.toHaveProperty('url');
      expect(result).not.toHaveProperty('s3Key');
    });

    it('throws NotFoundException when not found', async () => {
      const qb = repo.createQueryBuilder();
      qb.getOne.mockResolvedValue(null);

      await expect(
        service.findOne('bad-id', companyId, Role.COMPANY_ADMIN, callerRegions),
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
        callerRegions,
      );

      expect(result.name).toBe('Updated Name');
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('calls deleteDocumentFromStorage when s3Key is present, then removes record', async () => {
      mockMediaService.deleteDocumentFromStorage.mockResolvedValue(undefined);
      repo.remove.mockResolvedValue(mockDoc);

      await service.remove(
        'doc-uuid-1',
        companyId,
        Role.COMPANY_ADMIN,
        callerRegions,
      );

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

      await service.remove(
        'doc-uuid-1',
        companyId,
        Role.COMPANY_ADMIN,
        callerRegions,
      );

      expect(mockMediaService.deleteDocumentFromStorage).not.toHaveBeenCalled();
      expect(repo.remove).toHaveBeenCalledWith(docWithoutKey);
    });
  });

  describe('access control', () => {
    it('ACCOUNTANT only sees TEAM documents', async () => {
      await service.findAll(
        companyId,
        Role.ACCOUNTANT,
        1,
        20,
        undefined,
        undefined,
        undefined,
        callerRegions,
      );

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        { allowedLevels: [DocumentAccessLevel.TEAM] },
      );
    });

    it('AGENT only sees TEAM documents', async () => {
      await service.findAll(
        companyId,
        Role.AGENT,
        1,
        20,
        undefined,
        undefined,
        undefined,
        callerRegions,
      );

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        { allowedLevels: [DocumentAccessLevel.TEAM] },
      );
    });

    it('MANAGER only sees TEAM documents', async () => {
      await service.findAll(
        companyId,
        Role.MANAGER,
        1,
        20,
        undefined,
        undefined,
        undefined,
        callerRegions,
      );

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        { allowedLevels: [DocumentAccessLevel.TEAM] },
      );
    });

    it('ADMIN sees ADMIN and TEAM documents', async () => {
      await service.findAll(
        companyId,
        Role.ADMIN,
        1,
        20,
        undefined,
        undefined,
        undefined,
        callerRegions,
      );

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        {
          allowedLevels: [DocumentAccessLevel.ADMIN, DocumentAccessLevel.TEAM],
        },
      );
    });

    it('COMPANY_ADMIN sees ADMIN and TEAM documents', async () => {
      await service.findAll(companyId, Role.COMPANY_ADMIN, 1, 20);

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        {
          allowedLevels: [DocumentAccessLevel.ADMIN, DocumentAccessLevel.TEAM],
        },
      );
    });

    it('SUPER_ADMIN sees ADMIN and TEAM documents', async () => {
      await service.findAll(companyId, Role.SUPER_ADMIN, 1, 20);

      const qb = repo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'doc.access_level IN (:...allowedLevels)',
        {
          allowedLevels: [DocumentAccessLevel.ADMIN, DocumentAccessLevel.TEAM],
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
        callerRegions,
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
        service.downloadStream(
          'doc-uuid-1',
          companyId,
          Role.ACCOUNTANT,
          callerRegions,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockMediaService.getDocumentStream).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the document has no s3Key', async () => {
      const qb = repo.createQueryBuilder();
      qb.getOne.mockResolvedValue({ ...mockDoc, s3Key: null });

      await expect(
        service.downloadStream(
          'doc-uuid-1',
          companyId,
          Role.COMPANY_ADMIN,
          callerRegions,
        ),
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
        callerRegions,
      );

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
      expect(result[1].version).toBe(1);
    });

    it('walks through a company-wide ancestor for a confined caller', async () => {
      const v1 = {
        ...mockDoc,
        id: 'doc-v1',
        version: 1,
        regionCode: null,
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
      // Resolves only when the query offers a NULL-region branch.
      repo.findOne.mockImplementation(async (opts: any) => {
        const clauses = Array.isArray(opts.where) ? opts.where : [opts.where];
        const allowsNull = clauses.some((c: any) =>
          c.regionCode && c.regionCode.constructor?.name !== 'FindOperator'
            ? false
            : String(c.regionCode?.type) === 'isNull',
        );
        return allowsNull ? v1 : null;
      });

      const result = await service.getVersionHistory(
        'doc-v2',
        companyId,
        Role.MANAGER,
        callerRegions,
      );

      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('doc-v1');
    });
  });
  describe('region scoping', () => {
    const makkah = ['makkah'];
    const makkahAndPunjab = ['makkah', 'punjab'];

    // Visibility is decided from the region predicate the service actually
    // builds, so dropping the IS NULL branch fails these tests instead of
    // passing on the mock's own rules.
    function seedDocInRegion(regionCode: string | null) {
      const row = { ...mockDoc, regionCode };
      const params: Record<string, unknown> = {};
      let regionSql: string | null = null;
      const visible = () => {
        if (!regionSql) return true;
        const codes = (params.scopedCodes as string[] | undefined) ?? [];
        return regionCode === null
          ? regionSql.includes('IS NULL')
          : codes.includes(regionCode);
      };
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn((sql: string, p?: Record<string, unknown>) => {
          if (sql.includes('region_code')) {
            regionSql = sql;
          }
          Object.assign(params, p ?? {});
          return qb;
        }),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(() =>
          Promise.resolve(visible() ? [[row], 1] : [[], 0]),
        ),
        getOne: jest.fn(() => Promise.resolve(visible() ? row : null)),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      return row;
    }

    describe('by-id reads and writes', () => {
      it('denies findOne on a document outside the caller assigned regions', async () => {
        seedDocInRegion('punjab');

        await expect(
          service.findOne('doc-uuid-1', companyId, Role.MANAGER, makkah),
        ).rejects.toThrow(NotFoundException);
      });

      it('denies download on a document outside the caller assigned regions', async () => {
        seedDocInRegion('punjab');

        await expect(
          service.downloadStream('doc-uuid-1', companyId, Role.MANAGER, makkah),
        ).rejects.toThrow(NotFoundException);
        expect(mockMediaService.getDocumentStream).not.toHaveBeenCalled();
      });

      it('denies update on a document outside the caller assigned regions', async () => {
        seedDocInRegion('punjab');

        await expect(
          service.update(
            'doc-uuid-1',
            companyId,
            Role.MANAGER,
            { name: 'Renamed.pdf' },
            makkah,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('denies remove on a document outside the caller assigned regions', async () => {
        seedDocInRegion('punjab');

        await expect(
          service.remove('doc-uuid-1', companyId, Role.MANAGER, makkah),
        ).rejects.toThrow(NotFoundException);
        expect(
          mockMediaService.deleteDocumentFromStorage,
        ).not.toHaveBeenCalled();
        expect(repo.remove).not.toHaveBeenCalled();
      });

      it('denies getVersionHistory on a document outside the caller assigned regions', async () => {
        seedDocInRegion('punjab');

        await expect(
          service.getVersionHistory(
            'doc-uuid-1',
            companyId,
            Role.MANAGER,
            makkah,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('denies every by-id read when the caller has no assigned region', async () => {
        seedDocInRegion('makkah');

        await expect(
          service.findOne('doc-uuid-1', companyId, Role.MANAGER, []),
        ).rejects.toThrow(NotFoundException);
        expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      });

      it('allows a by-id read in any region the caller is assigned to', async () => {
        seedDocInRegion('punjab');

        const result = await service.findOne(
          'doc-uuid-1',
          companyId,
          Role.MANAGER,
          makkahAndPunjab,
        );

        expect(result.id).toBe('doc-uuid-1');
      });

      it('leaves admins unconfined by their own assignments', async () => {
        seedDocInRegion('punjab');

        const result = await service.findOne(
          'doc-uuid-1',
          companyId,
          Role.COMPANY_ADMIN,
          makkah,
        );

        expect(result.id).toBe('doc-uuid-1');
      });
    });

    describe('company-wide documents', () => {
      it('returns a NULL region document to a confined caller in any region', async () => {
        seedDocInRegion(null);

        const result = await service.findOne(
          'doc-uuid-1',
          companyId,
          Role.MANAGER,
          makkah,
        );

        expect(result.id).toBe('doc-uuid-1');
      });

      it('lists a NULL region document for a confined caller in any region', async () => {
        seedDocInRegion(null);

        const result = await service.findAll(
          companyId,
          Role.MANAGER,
          1,
          20,
          undefined,
          undefined,
          undefined,
          makkah,
        );

        expect(result.total).toBe(1);
        expect(result.data[0].id).toBe('doc-uuid-1');
      });

      it('keeps a regional document hidden from a list read outside that region', async () => {
        seedDocInRegion('punjab');

        const result = await service.findAll(
          companyId,
          Role.MANAGER,
          1,
          20,
          undefined,
          undefined,
          undefined,
          makkah,
        );

        expect(result.total).toBe(0);
        expect(result.data).toEqual([]);
      });

      it('confines a list read to the caller assigned regions with no region filter', async () => {
        seedDocInRegion('makkah');
        const qb = repo.createQueryBuilder();

        await service.findAll(
          companyId,
          Role.MANAGER,
          1,
          20,
          undefined,
          undefined,
          undefined,
          makkahAndPunjab,
        );

        expect(qb.andWhere).toHaveBeenCalledWith(
          '(doc.region_code IN (:...scopedCodes) OR doc.region_code IS NULL)',
          { scopedCodes: makkahAndPunjab },
        );
      });

      it('returns an empty page when the caller has no assigned region', async () => {
        seedDocInRegion('makkah');

        const result = await service.findAll(
          companyId,
          Role.MANAGER,
          1,
          20,
          undefined,
          undefined,
          undefined,
          [],
        );

        expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
        expect(repo.createQueryBuilder).not.toHaveBeenCalled();
      });

      it('leaves an admin list read unconfined', async () => {
        seedDocInRegion('punjab');
        const qb = repo.createQueryBuilder();

        const result = await service.findAll(
          companyId,
          Role.COMPANY_ADMIN,
          1,
          20,
          undefined,
          undefined,
          undefined,
          makkah,
        );

        expect(result.total).toBe(1);
        expect(qb.andWhere).not.toHaveBeenCalledWith(
          expect.stringContaining('region_code'),
          expect.anything(),
        );
      });
    });

    describe('upload region resolution', () => {
      const mockFile = {
        buffer: Buffer.from('pdf'),
        mimetype: 'application/pdf',
        originalname: 'contract.pdf',
        size: 51200,
      } as Express.Multer.File;

      beforeEach(() => {
        mockMediaService.uploadDocumentToStorage.mockResolvedValue({
          url: 'https://s3.example.com/doc.pdf',
          s3Key: 'companies/c1/documents/123-doc.pdf',
          fileSize: 51200,
        });
      });

      it('rejects a region outside the caller assigned set with 400', async () => {
        await expect(
          service.uploadAndCreate(
            companyId,
            userId,
            mockFile,
            { name: 'Contract', regionCode: 'punjab' } as any,
            { role: Role.MANAGER, regionCodes: makkah },
          ),
        ).rejects.toThrow(BadRequestException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('rejects a region the company does not operate, even for an admin', async () => {
        await expect(
          service.uploadAndCreate(
            companyId,
            userId,
            mockFile,
            { name: 'Contract', regionCode: 'atlantis' } as any,
            { role: Role.COMPANY_ADMIN, regionCodes: makkah },
          ),
        ).rejects.toThrow(BadRequestException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('accepts a region inside the caller assigned set', async () => {
        repo.create.mockReturnValue(mockDoc);
        repo.save.mockResolvedValue(mockDoc);

        await service.uploadAndCreate(
          companyId,
          userId,
          mockFile,
          { name: 'Contract', regionCode: 'makkah' } as any,
          { role: Role.MANAGER, regionCodes: makkah },
        );

        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ regionCode: 'makkah' }),
        );
      });

      it('files an unattached document as company-wide for an admin', async () => {
        repo.create.mockReturnValue(mockDoc);
        repo.save.mockResolvedValue(mockDoc);

        await service.uploadAndCreate(
          companyId,
          userId,
          mockFile,
          { name: 'Trade licence' } as any,
          { role: Role.COMPANY_ADMIN, regionCodes: makkah },
        );

        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ regionCode: null }),
        );
      });

      it('files an unattached document in the caller own region for a non-admin', async () => {
        repo.create.mockReturnValue(mockDoc);
        repo.save.mockResolvedValue(mockDoc);

        await service.uploadAndCreate(
          companyId,
          userId,
          mockFile,
          { name: 'Trade licence' } as any,
          { role: Role.MANAGER, regionCodes: makkah },
        );

        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ regionCode: 'makkah' }),
        );
      });

      it('rejects an unattached upload from a non-admin with no assigned region', async () => {
        await expect(
          service.uploadAndCreate(
            companyId,
            userId,
            mockFile,
            { name: 'Trade licence' } as any,
            { role: Role.MANAGER, regionCodes: [] },
          ),
        ).rejects.toThrow(BadRequestException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('takes the region of the unit the document is attached to', async () => {
        unitQb.row = { regionCode: 'punjab' };
        repo.create.mockReturnValue(mockDoc);
        repo.save.mockResolvedValue(mockDoc);

        await service.uploadAndCreate(
          companyId,
          userId,
          mockFile,
          { name: 'Ejari', unitId: 'unit-uuid-1' } as any,
          { role: Role.COMPANY_ADMIN, regionCodes: makkah },
        );

        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ regionCode: 'punjab' }),
        );
      });

      it('files an agent upload in their own region, never company-wide', async () => {
        repo.create.mockReturnValue(mockDoc);
        repo.save.mockResolvedValue(mockDoc);

        await service.uploadAndCreate(
          companyId,
          userId,
          mockFile,
          { name: 'Site photo' } as any,
          { role: Role.AGENT, regionCodes: ['makkah'] },
        );

        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ regionCode: 'makkah' }),
        );
      });

      it('rejects a unit belonging to another company', async () => {
        unitQb.row = { regionCode: 'punjab' };
        repo.create.mockReturnValue(mockDoc);
        repo.save.mockResolvedValue(mockDoc);

        await expect(
          service.uploadAndCreate(
            'another-company-uuid',
            userId,
            mockFile,
            { name: 'Ejari', unitId: 'unit-uuid-1' } as any,
            { role: Role.COMPANY_ADMIN, regionCodes: makkah },
          ),
        ).rejects.toThrow(BadRequestException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('takes the region of the asset the document is attached to', async () => {
        assetQb.row = { regionCode: 'punjab' };
        repo.create.mockReturnValue(mockDoc);
        repo.save.mockResolvedValue(mockDoc);

        await service.uploadAndCreate(
          companyId,
          userId,
          mockFile,
          { name: 'Insurance', assetId: 'asset-uuid-1' } as any,
          { role: Role.COMPANY_ADMIN, regionCodes: makkah },
        );

        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ regionCode: 'punjab' }),
        );
      });
    });
  });
});
