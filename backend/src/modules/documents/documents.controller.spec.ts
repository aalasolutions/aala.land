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
  const mockReq = { user: { companyId, userId, role, email: 'test@example.com' } } as any;

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
            uploadAndCreate:    jest.fn(),
            findAll:            jest.fn(),
            findOne:            jest.fn(),
            update:             jest.fn(),
            remove:             jest.fn(),
            getVersionHistory:  jest.fn(),
            downloadStream:     jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DocumentsController>(DocumentsController);
    service    = module.get(DocumentsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadDocument', () => {
    it('calls documentsService.uploadAndCreate with companyId, userId, file, dto', async () => {
      service.uploadAndCreate.mockResolvedValue(mockDoc as any);

      const mockFile = {
        buffer:       Buffer.from('pdf content'),
        mimetype:     'application/pdf',
        originalname: 'contract.pdf',
        size:         51200,
      } as Express.Multer.File;
      const dto = { name: 'Service Contract', category: DocumentCategory.LEASE };

      const result = await controller.uploadDocument(mockFile, dto as any, mockReq);

      expect(service.uploadAndCreate).toHaveBeenCalledWith(
        companyId,
        userId,
        mockFile,
        dto,
      );
      expect(result).toEqual(mockDoc);
    });

    it('throws BadRequestException when no file is provided', async () => {
      await expect(
        controller.uploadDocument(undefined as any, { name: 'test' } as any, mockReq),
      ).rejects.toThrow('No file provided');
    });
  });

  describe('findAll', () => {
    it('returns paginated documents', async () => {
      service.findAll.mockResolvedValue(paginated as any);

      await controller.findAll(mockReq, 1, 20);

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

  describe('download', () => {
    it('streams the document with headers set from the re-checked doc metadata', async () => {
      const fakeStream = { pipe: jest.fn(), on: jest.fn() };
      service.downloadStream.mockResolvedValue({ stream: fakeStream as any, doc: mockDoc as any });

      const res = {
        setHeader: jest.fn(),
      } as any;

      await controller.download('doc-uuid-1', mockReq, res);

      expect(service.downloadStream).toHaveBeenCalledWith('doc-uuid-1', companyId, role);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="Lease Agreement.pdf"',
      );
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(fakeStream.pipe).toHaveBeenCalledWith(res);
    });

    it('sanitizes quotes in the filename to prevent header injection', async () => {
      const fakeStream = { pipe: jest.fn(), on: jest.fn() };
      service.downloadStream.mockResolvedValue({
        stream: fakeStream as any,
        doc: { ...mockDoc, name: 'weird"name.pdf' } as any,
      });

      const res = { setHeader: jest.fn() } as any;
      await controller.download('doc-uuid-1', mockReq, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="weird_name.pdf"',
      );
    });

    it('sanitizes CR/LF in the filename to prevent header injection', async () => {
      const fakeStream = { pipe: jest.fn(), on: jest.fn() };
      service.downloadStream.mockResolvedValue({
        stream: fakeStream as any,
        doc: { ...mockDoc, name: 'evil\r\nX-Injected: 1.pdf' } as any,
      });

      const res = { setHeader: jest.fn() } as any;
      await controller.download('doc-uuid-1', mockReq, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="evil__X-Injected: 1.pdf"',
      );
    });

    it('responds with 500 and does not crash when the stream errors before headers are flushed', async () => {
      let errorHandler: (err: Error) => void = () => {};
      const fakeStream = {
        pipe: jest.fn(),
        on: jest.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') errorHandler = handler;
        }),
      };
      service.downloadStream.mockResolvedValue({ stream: fakeStream as any, doc: mockDoc as any });

      const res = { setHeader: jest.fn(), headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn(), destroy: jest.fn() } as any;
      await controller.download('doc-uuid-1', mockReq, res);

      errorHandler(new Error('connection reset'));

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.destroy).not.toHaveBeenCalled();
    });

    it('destroys the response instead of setting a status when headers were already sent', async () => {
      let errorHandler: (err: Error) => void = () => {};
      const fakeStream = {
        pipe: jest.fn(),
        on: jest.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') errorHandler = handler;
        }),
      };
      service.downloadStream.mockResolvedValue({ stream: fakeStream as any, doc: mockDoc as any });

      const res = { setHeader: jest.fn(), headersSent: true, status: jest.fn().mockReturnThis(), json: jest.fn(), destroy: jest.fn() } as any;
      await controller.download('doc-uuid-1', mockReq, res);

      const err = new Error('connection reset');
      errorHandler(err);

      expect(res.destroy).toHaveBeenCalledWith(err);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates a document', async () => {
      service.update.mockResolvedValue({ ...mockDoc, name: 'Renamed.pdf' } as any);

      await controller.update('doc-uuid-1', { name: 'Renamed.pdf' }, mockReq);

      expect(service.update).toHaveBeenCalledWith('doc-uuid-1', companyId, role, { name: 'Renamed.pdf' });
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
