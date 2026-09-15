import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { SystemEmailService } from '../email/system-email.service';
import { StoragePurgeService } from '../storage-purge/storage-purge.service';
import { DataSource, IsNull } from 'typeorm';
import { PropertyMedia } from './entities/property-media.entity';
import { Unit } from './entities/unit.entity';
import { Asset } from './entities/asset.entity';
import {
  Company,
  SubscriptionTier,
  FREE_STORAGE_BYTES,
} from '../companies/entities/company.entity';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Mock sharp so tests run without native binaries
jest.mock('sharp', () => {
  const sharpChain = {
    metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
    rotate: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    flatten: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed')),
  };
  const sharpFn: any = jest.fn(() => sharpChain);
  sharpFn.__chain = sharpChain;
  return sharpFn;
});

// Mock @aws-sdk/client-s3
const mockSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));

// Document uploads are spooled to a real temp file by multer (see
// documents.controller.ts), so makeFile() writes an actual file to disk —
// createReadStream/unlink in uploadDocumentToStorage need a real path to act on.
const makeFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File => {
  const path =
    overrides.path ?? join(tmpdir(), `media-service-spec-${randomUUID()}`);
  if (!overrides.path)
    writeFileSync(path, overrides.buffer ?? Buffer.from('fake-image-data'));
  return {
    buffer: Buffer.from('fake-image-data'),
    mimetype: 'image/jpeg',
    originalname: 'photo.jpg',
    size: 1024,
    fieldname: 'file',
    encoding: '7bit',
    stream: null as any,
    destination: '',
    filename: '',
    path,
    ...overrides,
  };
};

describe('MediaService', () => {
  let service: MediaService;
  let companyRepo: any;
  let mediaRepo: any;
  let unitRepo: any;
  let systemEmail: { sendQuotaExceededToCompany: jest.Mock };
  let mockQb: any;
  let manager: { findOne: jest.Mock; getRepository: jest.Mock };
  let storagePurge: { purge: jest.Mock; dispatch: jest.Mock };

  const companyId = 'company-uuid-1';
  const unitId = 'unit-uuid-1';

  const originalEnv = process.env;

  const mockCompany: Partial<Company> = {
    id: companyId,
    storageUsedBytes: 0 as any,
    purchasedSeats: 1,
    subscriptionTier: SubscriptionTier.FREE,
  };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.AWS_S3_BUCKET = 'test-media-bucket';
    process.env.AWS_S3_DOCUMENTS_BUCKET = 'test-documents-bucket';
    process.env.AWS_DOCUMENTS_ACCESS_KEY_ID = 'test-documents-key';
    process.env.AWS_DOCUMENTS_SECRET_ACCESS_KEY = 'test-documents-secret';
    process.env.S3_ENDPOINT = 'https://s3.example.com';

    mockSend.mockResolvedValue({});

    mockQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    manager = {
      findOne: jest.fn().mockResolvedValue({ id: unitId, deletedAt: null }),
      getRepository: jest.fn(() => mediaRepo),
    };
    storagePurge = {
      purge: jest.fn().mockResolvedValue(['purge-1', 'purge-2']),
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        {
          provide: getRepositoryToken(PropertyMedia),
          useValue: {
            create: jest.fn().mockReturnValue({ id: 'media-1' }),
            save: jest.fn().mockResolvedValue({ id: 'media-1' }),
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockResolvedValue({}),
            remove: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: getRepositoryToken(Company),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockCompany),
            createQueryBuilder: jest.fn().mockReturnValue(mockQb),
          },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: {
            findOne: jest.fn().mockResolvedValue({ id: unitId, companyId }),
          },
        },
        {
          provide: getRepositoryToken(Asset),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: SystemEmailService,
          useValue: { sendQuotaExceededToCompany: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
          },
        },
        { provide: StoragePurgeService, useValue: storagePurge },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    companyRepo = module.get(getRepositoryToken(Company));
    mediaRepo = module.get(getRepositoryToken(PropertyMedia));
    unitRepo = module.get(getRepositoryToken(Unit));
    systemEmail = module.get(SystemEmailService);

    // Default: file-type confirms JPEG
    (fileTypeFromBuffer as jest.Mock).mockResolvedValue({
      mime: 'image/jpeg',
      ext: 'jpg',
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('setPrimary', () => {
    it('refuses a photo on an archived unit', async () => {
      mediaRepo.findOne.mockResolvedValue({ id: 'media-1', companyId, unitId });
      manager.findOne.mockResolvedValue({ id: unitId, deletedAt: new Date() });

      await expect(service.setPrimary('media-1', companyId)).rejects.toThrow(
        ConflictException,
      );
      expect(manager.findOne).toHaveBeenCalledWith(Unit, {
        where: { id: unitId, companyId },
        select: { id: true, deletedAt: true },
        lock: { mode: 'pessimistic_read' },
      });
      expect(mediaRepo.update).not.toHaveBeenCalled();
      expect(mediaRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('uploadImage — archived unit', () => {
    it('refuses an upload to an archived unit with 409 before any storage write', async () => {
      unitRepo.findOne.mockResolvedValue({
        id: unitId,
        companyId,
        deletedAt: new Date(),
      });

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toThrow(ConflictException);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('refuses a unit archived after the storage write and releases the upload', async () => {
      const releaseSpy = jest
        .spyOn(service, 'decrementStorage')
        .mockResolvedValue(undefined);
      manager.findOne.mockResolvedValue({ id: unitId, deletedAt: new Date() });

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toThrow(ConflictException);
      expect(manager.findOne).toHaveBeenCalledWith(Unit, {
        where: { id: unitId, companyId },
        select: { id: true, deletedAt: true },
        lock: { mode: 'pessimistic_read' },
      });
      expect(mediaRepo.save).not.toHaveBeenCalled();
      expect(DeleteObjectCommand).toHaveBeenCalledTimes(2);
      expect(releaseSpy).toHaveBeenCalledWith(companyId, expect.any(Number));
    });

    it('refuses a unit deleted while waiting for the lock and releases the upload', async () => {
      const releaseSpy = jest
        .spyOn(service, 'decrementStorage')
        .mockResolvedValue(undefined);
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toThrow(NotFoundException);
      expect(mediaRepo.save).not.toHaveBeenCalled();
      expect(DeleteObjectCommand).toHaveBeenCalledTimes(2);
      expect(releaseSpy).toHaveBeenCalledWith(companyId, expect.any(Number));
    });

    it('does not accept an asset upload through archived units only', async () => {
      unitRepo.findOne.mockResolvedValue(null);
      await expect(
        service.uploadImage(companyId, makeFile(), { assetId: 'asset-1' }),
      ).rejects.toThrow(NotFoundException);
      expect(unitRepo.findOne).toHaveBeenCalledWith({
        where: { assetId: 'asset-1', companyId, deletedAt: IsNull() },
      });
    });
  });

  describe('uploadImage — validation', () => {
    it('rejects when neither unitId nor assetId is provided', async () => {
      await expect(
        service.uploadImage(companyId, makeFile(), {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a disallowed MIME type (client header)', async () => {
      await expect(
        service.uploadImage(
          companyId,
          makeFile({ mimetype: 'application/pdf' }),
          { unitId },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when file size exceeds 5 MB', async () => {
      await expect(
        service.uploadImage(companyId, makeFile({ size: 6 * 1024 * 1024 }), {
          unitId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when magic bytes do not match an allowed type', async () => {
      (fileTypeFromBuffer as jest.Mock).mockResolvedValue({
        mime: 'application/zip',
        ext: 'zip',
      });

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when dimensions exceed the decompression-bomb limit', async () => {
      const sharp = require('sharp');
      sharp.__chain.metadata.mockResolvedValueOnce({
        width: 15_000,
        height: 15_000,
      });

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 507 when storage quota is exceeded', async () => {
      companyRepo.findOne.mockResolvedValue({
        ...mockCompany,
        storageUsedBytes: FREE_STORAGE_BYTES,
        subscriptionTier: SubscriptionTier.FREE,
      });
      // Simulates the real atomic UPDATE's WHERE clause failing to match any row
      // because storage_used_bytes + incomingBytes > quotaBytes.
      mockQb.execute.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toMatchObject({ status: 507 });
    });

    it('does not reserve storage when the quota check is rejected', async () => {
      companyRepo.findOne.mockResolvedValue({
        ...mockCompany,
        storageUsedBytes: FREE_STORAGE_BYTES,
        subscriptionTier: SubscriptionTier.FREE,
      });
      mockQb.execute.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toMatchObject({ status: 507 });

      // Only the failed reservation attempt touched the counter — no S3 PUT happened.
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('emails the company on the 507 path after claiming the 24h window', async () => {
      companyRepo.findOne.mockResolvedValue({
        ...mockCompany,
        storageUsedBytes: FREE_STORAGE_BYTES,
        subscriptionTier: SubscriptionTier.FREE,
      });
      mockQb.execute.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toMatchObject({ status: 507 });

      await new Promise((resolve) => setImmediate(resolve));

      expect(systemEmail.sendQuotaExceededToCompany).toHaveBeenCalledWith(
        companyId,
        'storage',
        expect.stringContaining('storage'),
      );
    });

    it('does not email when the 24h dedup window is already claimed', async () => {
      companyRepo.findOne.mockResolvedValue({
        ...mockCompany,
        storageUsedBytes: FREE_STORAGE_BYTES,
        subscriptionTier: SubscriptionTier.FREE,
      });
      mockQb.execute
        .mockResolvedValueOnce({ affected: 0 })
        .mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toMatchObject({ status: 507 });
      await new Promise((resolve) => setImmediate(resolve));

      expect(systemEmail.sendQuotaExceededToCompany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when unit does not belong to company', async () => {
      unitRepo.findOne.mockResolvedValue(null);

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadImage — S3 rollback on thumbnail failure', () => {
    it('deletes the original object when thumbnail PUT fails', async () => {
      mockSend
        .mockResolvedValueOnce({}) // original PUT succeeds
        .mockRejectedValueOnce(new Error('S3 timeout')) // thumbnail PUT fails
        .mockResolvedValueOnce({}); // rollback DELETE

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toThrow(InternalServerErrorException);

      // send() was called 3 times: original PUT, thumbnail PUT (fails), rollback DELETE
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('releases the storage reservation when the thumbnail PUT fails', async () => {
      const releaseSpy = jest
        .spyOn(service, 'decrementStorage')
        .mockResolvedValue(undefined);
      mockSend
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('S3 timeout'))
        .mockResolvedValueOnce({});

      await expect(
        service.uploadImage(companyId, makeFile(), { unitId }),
      ).rejects.toThrow(InternalServerErrorException);

      expect(releaseSpy).toHaveBeenCalledWith(companyId, expect.any(Number));
    });
  });

  describe('uploadImage — stored content type', () => {
    it('saves contentType as image/jpeg even when input MIME is image/png', async () => {
      (fileTypeFromBuffer as jest.Mock).mockResolvedValue({
        mime: 'image/png',
        ext: 'png',
      });

      await service.uploadImage(
        companyId,
        makeFile({ mimetype: 'image/png', originalname: 'photo.png' }),
        { unitId },
      );

      expect(mediaRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'image/jpeg' }),
      );
    });
  });

  describe('uploadDocumentToStorage — validation', () => {
    it('rejects a disallowed MIME type', async () => {
      await expect(
        service.uploadDocumentToStorage(
          companyId,
          makeFile({ mimetype: 'text/html' }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when magic bytes conflict with the declared MIME type', async () => {
      (fileTypeFromFile as jest.Mock).mockResolvedValue({
        mime: 'application/zip',
        ext: 'zip',
      });

      await expect(
        service.uploadDocumentToStorage(
          companyId,
          makeFile({ mimetype: 'application/pdf' }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a PDF with matching magic bytes and returns upload result', async () => {
      (fileTypeFromFile as jest.Mock).mockResolvedValue({
        mime: 'application/pdf',
        ext: 'pdf',
      });

      const result = await service.uploadDocumentToStorage(
        companyId,
        makeFile({ mimetype: 'application/pdf', originalname: 'contract.pdf' }),
      );

      expect(result).toHaveProperty('s3Key');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('fileSize', 1024);
    });

    it('throws 507 when storage quota is exceeded', async () => {
      companyRepo.findOne.mockResolvedValue({
        ...mockCompany,
        storageUsedBytes: FREE_STORAGE_BYTES,
        subscriptionTier: SubscriptionTier.FREE,
      });
      mockQb.execute.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.uploadDocumentToStorage(
          companyId,
          makeFile({
            mimetype: 'application/pdf',
            originalname: 'contract.pdf',
          }),
        ),
      ).rejects.toMatchObject({ status: 507 });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('releases the storage reservation when the S3 PUT fails', async () => {
      const releaseSpy = jest
        .spyOn(service, 'decrementStorage')
        .mockResolvedValue(undefined);
      mockSend.mockRejectedValueOnce(new Error('S3 timeout'));

      await expect(
        service.uploadDocumentToStorage(
          companyId,
          makeFile({
            mimetype: 'application/pdf',
            originalname: 'contract.pdf',
          }),
        ),
      ).rejects.toThrow(InternalServerErrorException);

      expect(releaseSpy).toHaveBeenCalledWith(companyId, 1024);
    });
  });

  describe('getDocumentStream', () => {
    it('returns the S3 object Body for a valid key', async () => {
      const fakeBody = { pipe: jest.fn() };
      mockSend.mockResolvedValueOnce({ Body: fakeBody });

      const result = await service.getDocumentStream(
        'companies/c1/documents/123-doc.pdf',
      );

      expect(result).toBe(fakeBody);
    });

    it('throws NotFoundException when the S3 object has no Body', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(
        service.getDocumentStream('companies/c1/documents/missing.pdf'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when S3 reports the key does not exist', async () => {
      const notFoundErr = Object.assign(
        new Error('The specified key does not exist.'),
        {
          name: 'NoSuchKey',
        },
      );
      mockSend.mockRejectedValueOnce(notFoundErr);

      await expect(
        service.getDocumentStream('companies/c1/documents/missing.pdf'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws InternalServerErrorException when the S3 fetch fails for another reason', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 unavailable'));

      await expect(
        service.getDocumentStream('companies/c1/documents/123-doc.pdf'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('fetches from the documents bucket, not the media bucket', async () => {
      mockSend.mockResolvedValueOnce({ Body: { pipe: jest.fn() } });

      await service.getDocumentStream('companies/c1/documents/123-doc.pdf');

      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'test-documents-bucket' }),
      );
    });
  });

  describe('bucket separation', () => {
    it('uploads property photos and thumbnails to the media bucket', async () => {
      await service.uploadImage(companyId, makeFile(), { unitId });

      const putCalls = (PutObjectCommand as unknown as jest.Mock).mock.calls;
      expect(putCalls.length).toBeGreaterThanOrEqual(2);
      putCalls.forEach(([arg]) => expect(arg.Bucket).toBe('test-media-bucket'));
    });

    it('uploads documents to the documents bucket', async () => {
      await service.uploadDocumentToStorage(
        companyId,
        makeFile({ mimetype: 'application/pdf' }),
      );

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'test-documents-bucket' }),
      );
    });

    it('prefixes every generated key with land/, for both photos and documents', async () => {
      await service.uploadImage(companyId, makeFile(), { unitId });
      await service.uploadDocumentToStorage(
        companyId,
        makeFile({ mimetype: 'application/pdf' }),
      );

      const putCalls = (PutObjectCommand as unknown as jest.Mock).mock.calls;
      putCalls.forEach(([arg]) => expect(arg.Key).toMatch(/^land\//));
    });
  });

  describe('deleteMedia', () => {
    const media = {
      id: 'media-1',
      companyId,
      s3Key: 'companies/c1/properties/u1/123-photo.jpg',
      fileSize: 100,
      thumbnailSize: 50,
    };

    it('locks the row in a transaction, purges it, then dispatches after commit', async () => {
      manager.findOne.mockResolvedValue(media);
      const order: string[] = [];
      storagePurge.purge.mockImplementation(async () => {
        order.push('purge');
        return ['purge-1', 'purge-2'];
      });
      storagePurge.dispatch.mockImplementation(async () => {
        order.push('dispatch');
      });

      await service.deleteMedia('media-1', companyId);

      expect(manager.findOne).toHaveBeenCalledWith(PropertyMedia, {
        where: { id: 'media-1', companyId },
        lock: { mode: 'pessimistic_write' },
      });
      expect(storagePurge.purge).toHaveBeenCalledWith(manager, {
        media: [media],
      });
      expect(storagePurge.dispatch).toHaveBeenCalledWith([
        'purge-1',
        'purge-2',
      ]);
      expect(order).toEqual(['purge', 'dispatch']);
    });

    it('never touches storage directly', async () => {
      manager.findOne.mockResolvedValue(media);

      await service.deleteMedia('media-1', companyId);

      expect(DeleteObjectCommand).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
      expect(mediaRepo.remove).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for media of another company and purges nothing', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.deleteMedia('media-1', 'other-company'),
      ).rejects.toThrow(NotFoundException);
      expect(manager.findOne).toHaveBeenCalledWith(
        PropertyMedia,
        expect.objectContaining({
          where: { id: 'media-1', companyId: 'other-company' },
        }),
      );
      expect(storagePurge.purge).not.toHaveBeenCalled();
      expect(storagePurge.dispatch).not.toHaveBeenCalled();
    });

    it('does not dispatch when the transaction fails', async () => {
      manager.findOne.mockResolvedValue(media);
      storagePurge.purge.mockRejectedValue(new Error('deadlock detected'));

      await expect(service.deleteMedia('media-1', companyId)).rejects.toThrow(
        'deadlock detected',
      );
      expect(storagePurge.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('per-bucket credential scoping', () => {
    const s3Configs = () =>
      (S3Client as unknown as jest.Mock).mock.calls.map(([cfg]) => cfg);

    it('builds the documents client with the documents-scoped key, never the media key', async () => {
      await service.uploadDocumentToStorage(
        companyId,
        makeFile({ mimetype: 'application/pdf' }),
      );

      const configs = s3Configs();
      expect(configs).toContainEqual(
        expect.objectContaining({
          credentials: {
            accessKeyId: 'test-documents-key',
            secretAccessKey: 'test-documents-secret',
          },
        }),
      );
      configs.forEach((cfg) =>
        expect(cfg.credentials.accessKeyId).not.toBe('test-key'),
      );
    });

    it('builds the media client with the media-scoped key', async () => {
      await service.uploadImage(companyId, makeFile(), { unitId });

      expect(s3Configs()).toContainEqual(
        expect.objectContaining({
          credentials: {
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
          },
        }),
      );
    });

    it('throws instead of falling back to the media key when the documents key is unset', async () => {
      delete process.env.AWS_DOCUMENTS_ACCESS_KEY_ID;
      delete process.env.AWS_DOCUMENTS_SECRET_ACCESS_KEY;

      await expect(
        service.uploadDocumentToStorage(
          companyId,
          makeFile({ mimetype: 'application/pdf' }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
