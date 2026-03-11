import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DocumentCategory, DocumentAccessLevel } from '../properties/entities/property-document.entity';

describe('DocumentsController', () => {
  let controller: DocumentsController;
  let service: jest.Mocked<DocumentsService>;

  const companyId = 'company-uuid-1';
  const userId = 'user-uuid-1';
  const role = 'company_admin';
  const mockReq = { user: { companyId, userId, role } };

  const mockDoc = {
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
  };

  const paginated = { data: [mockDoc], total: 1, page: 1, limit: 20 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        {
          provide: DocumentsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            getVersionHistory: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DocumentsController>(DocumentsController);
    service = module.get(DocumentsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('creates a document scoped to company', async () => {
      service.create.mockResolvedValue(mockDoc as any);

      const dto = { name: 'Lease Agreement.pdf', url: 'https://s3.example.com/docs/lease.pdf' };
      await controller.create(dto as any, mockReq);

      expect(service.create).toHaveBeenCalledWith(companyId, userId, dto);
    });
  });

  describe('findAll', () => {
    it('returns paginated documents', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      const result = await controller.findAll(mockReq, 1, 20);

      expect(service.findAll).toHaveBeenCalledWith(companyId, role, 1, 20, undefined);
    });

    it('passes category filter', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      await controller.findAll(mockReq, 1, 20, DocumentCategory.LEASE);

      expect(service.findAll).toHaveBeenCalledWith(companyId, role, 1, 20, DocumentCategory.LEASE);
    });
  });

  describe('findOne', () => {
    it('returns document by id', async () => {
      service.findOne.mockResolvedValue(mockDoc as any);

      await controller.findOne('doc-uuid-1', mockReq);

      expect(service.findOne).toHaveBeenCalledWith('doc-uuid-1', companyId, role);
    });
  });

  describe('getVersionHistory', () => {
    it('returns version history', async () => {
      service.getVersionHistory.mockResolvedValue([mockDoc] as any);

      await controller.getVersionHistory('doc-uuid-1', mockReq);

      expect(service.getVersionHistory).toHaveBeenCalledWith('doc-uuid-1', companyId, role);
    });
  });

  describe('update', () => {
    it('updates a document', async () => {
      service.update.mockResolvedValue({ ...mockDoc, name: 'Renamed.pdf' } as any);

      await controller.update('doc-uuid-1', { name: 'Renamed.pdf' }, mockReq);

      expect(service.update).toHaveBeenCalledWith('doc-uuid-1', companyId, userId, role, { name: 'Renamed.pdf' });
    });
  });

  describe('remove', () => {
    it('removes a document', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('doc-uuid-1', mockReq);

      expect(service.remove).toHaveBeenCalledWith('doc-uuid-1', companyId, role);
    });
  });
});
