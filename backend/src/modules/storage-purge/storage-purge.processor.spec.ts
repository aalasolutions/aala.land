import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnrecoverableError } from 'bullmq';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { StoragePurgeProcessor } from './storage-purge.processor';
import {
  StorageBucketKind,
  StoragePurgeJob,
  StoragePurgeStatus,
} from './entities/storage-purge-job.entity';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  DeleteObjectCommand: jest.fn((input) => input),
}));

describe('StoragePurgeProcessor', () => {
  let processor: StoragePurgeProcessor;
  let repo: { findOne: jest.Mock; update: jest.Mock };
  const originalEnv = process.env;

  const row = (overrides: Partial<StoragePurgeJob> = {}) =>
    ({
      id: 'purge-1',
      companyId: 'company-1',
      bucketKind: StorageBucketKind.MEDIA,
      s3Key: 'land/companies/c1/properties/u1/123-photo.jpg',
      status: StoragePurgeStatus.PENDING,
      attempts: 0,
      ...overrides,
    }) as StoragePurgeJob;

  const job = (attemptsMade = 0) =>
    ({ data: { id: 'purge-1' }, attemptsMade, opts: { attempts: 5 } }) as any;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AWS_ACCESS_KEY_ID: 'media-key',
      AWS_SECRET_ACCESS_KEY: 'media-secret',
      AWS_S3_BUCKET: 'test-media-bucket',
      AWS_DOCUMENTS_ACCESS_KEY_ID: 'documents-key',
      AWS_DOCUMENTS_SECRET_ACCESS_KEY: 'documents-secret',
      AWS_S3_DOCUMENTS_BUCKET: 'test-documents-bucket',
    };
    mockSend.mockResolvedValue({});
    repo = {
      findOne: jest.fn().mockResolvedValue(row()),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoragePurgeProcessor,
        { provide: getRepositoryToken(StoragePurgeJob), useValue: repo },
      ],
    }).compile();

    processor = module.get(StoragePurgeProcessor);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('deletes a media object from the media bucket and marks the row DONE', async () => {
    await processor.process(job());

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-media-bucket',
      Key: 'land/companies/c1/properties/u1/123-photo.jpg',
    });
    expect(repo.update).toHaveBeenCalledWith('purge-1', {
      status: StoragePurgeStatus.DONE,
      processedAt: expect.any(Date),
      lastError: null,
    });
  });

  it('deletes a document object from the documents bucket', async () => {
    repo.findOne.mockResolvedValue(
      row({ bucketKind: StorageBucketKind.DOCUMENTS, s3Key: 'land/doc.pdf' }),
    );

    await processor.process(job());

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-documents-bucket',
      Key: 'land/doc.pdf',
    });
  });

  it('skips a row that is already DONE', async () => {
    repo.findOne.mockResolvedValue(row({ status: StoragePurgeStatus.DONE }));

    await processor.process(job());

    expect(mockSend).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('skips a job whose outbox row no longer exists', async () => {
    repo.findOne.mockResolvedValue(null);
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);

    await expect(processor.process(job())).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('treats a missing object as success', async () => {
    mockSend.mockRejectedValue(
      Object.assign(new Error('not found'), {
        name: 'NoSuchKey',
        $metadata: { httpStatusCode: 404 },
      }),
    );

    await processor.process(job());

    expect(repo.update).toHaveBeenCalledWith(
      'purge-1',
      expect.objectContaining({ status: StoragePurgeStatus.DONE }),
    );
  });

  it('does not treat a missing bucket as success', async () => {
    const err = Object.assign(new Error('bucket missing'), {
      name: 'NoSuchBucket',
      $metadata: { httpStatusCode: 404 },
    });
    mockSend.mockRejectedValue(err);

    await expect(processor.process(job(1))).rejects.toBe(err);
    expect(repo.update).not.toHaveBeenCalledWith(
      'purge-1',
      expect.objectContaining({ status: StoragePurgeStatus.DONE }),
    );
  });

  it('records the attempt and error, then rethrows so BullMQ retries', async () => {
    const err = new Error('503 Service Unavailable');
    mockSend.mockRejectedValue(err);

    await expect(processor.process(job(1))).rejects.toBe(err);
    expect(repo.update).toHaveBeenCalledWith('purge-1', {
      attempts: 1,
      lastError: '503 Service Unavailable',
    });
  });

  it('marks the row FAILED and stops retrying on the last attempt', async () => {
    repo.findOne.mockResolvedValue(row({ attempts: 4 }));
    mockSend.mockRejectedValue(new Error('403 Forbidden'));
    jest
      .spyOn(processor['logger'], 'error')
      .mockImplementation(() => undefined);

    await expect(processor.process(job(4))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(repo.update).toHaveBeenCalledWith('purge-1', {
      attempts: 5,
      lastError: '403 Forbidden',
      status: StoragePurgeStatus.FAILED,
    });
  });

  it('records a missing bucket configuration as a failed attempt', async () => {
    delete process.env.AWS_S3_BUCKET;

    await expect(processor.process(job())).rejects.toThrow(
      'AWS_S3_BUCKET is not configured.',
    );
    expect(repo.update).toHaveBeenCalledWith(
      'purge-1',
      expect.objectContaining({ attempts: 1 }),
    );
  });
});
