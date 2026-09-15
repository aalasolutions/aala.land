import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, UnrecoverableError } from 'bullmq';
import { Repository } from 'typeorm';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  StorageBucketKind,
  StoragePurgeJob,
  StoragePurgeStatus,
} from './entities/storage-purge-job.entity';
import {
  STORAGE_PURGE_MAX_ATTEMPTS,
  STORAGE_PURGE_QUEUE,
  StoragePurgeJobData,
} from './storage-purge.constants';
import {
  StorageTarget,
  buildDocumentsClient,
  buildMediaClient,
  getDocumentsBucket,
  getMediaBucket,
} from './storage-targets.util';

@Processor(STORAGE_PURGE_QUEUE)
export class StoragePurgeProcessor extends WorkerHost {
  private readonly logger = new Logger(StoragePurgeProcessor.name);
  private mediaClient: S3Client | null = null;
  private documentsClient: S3Client | null = null;

  constructor(
    @InjectRepository(StoragePurgeJob)
    private readonly purgeJobRepository: Repository<StoragePurgeJob>,
  ) {
    super();
  }

  async process(job: Job<StoragePurgeJobData>): Promise<void> {
    const row = await this.purgeJobRepository.findOne({
      where: { id: job.data.id },
    });
    if (!row) {
      this.logger.warn(`Storage purge row ${job.data.id} not found, skipping`);
      return;
    }
    if (row.status === StoragePurgeStatus.DONE) return;

    try {
      const { client, bucket } = this.targetFor(row.bucketKind);
      await client
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: row.s3Key }))
        .catch((err: unknown) => {
          if (!isNotFound(err)) throw err;
        });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = row.attempts + 1;
      const exhausted =
        attempts >= STORAGE_PURGE_MAX_ATTEMPTS ||
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      await this.purgeJobRepository.update(row.id, {
        attempts,
        lastError: message,
        ...(exhausted ? { status: StoragePurgeStatus.FAILED } : {}),
      });

      if (exhausted) {
        this.logger.error(
          `Storage purge ${row.id} failed permanently after ${attempts} attempt(s): bucket=${row.bucketKind} key=${row.s3Key} error=${message}`,
        );
        throw new UnrecoverableError(message);
      }
      throw err;
    }

    await this.purgeJobRepository.update(row.id, {
      status: StoragePurgeStatus.DONE,
      processedAt: new Date(),
      lastError: null,
    });
  }

  private targetFor(kind: StorageBucketKind): StorageTarget {
    if (kind === StorageBucketKind.DOCUMENTS) {
      this.documentsClient ??= buildDocumentsClient();
      return { client: this.documentsClient, bucket: getDocumentsBucket() };
    }
    this.mediaClient ??= buildMediaClient();
    return { client: this.mediaClient, bucket: getMediaBucket() };
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.name === 'NoSuchKey';
}
