import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EntityManager, In } from 'typeorm';
import { PropertyMedia } from '../properties/entities/property-media.entity';
import { PropertyDocument } from '../properties/entities/property-document.entity';
import { Company } from '../companies/entities/company.entity';
import { errorMessage } from '@shared/utils/error.util';
import {
  StorageBucketKind,
  StoragePurgeJob,
} from './entities/storage-purge-job.entity';
import {
  STORAGE_PURGE_JOB_NAME,
  STORAGE_PURGE_MAX_ATTEMPTS,
  STORAGE_PURGE_QUEUE,
  StoragePurgeJobData,
} from './storage-purge.constants';
import { getThumbnailKey } from './storage-targets.util';

export interface StoragePurgeFiles {
  media?: PropertyMedia[];
  documents?: PropertyDocument[];
}

@Injectable()
export class StoragePurgeService {
  private readonly logger = new Logger(StoragePurgeService.name);

  constructor(
    @InjectQueue(STORAGE_PURGE_QUEUE)
    private readonly queue: Queue<StoragePurgeJobData>,
  ) {}

  // Runs inside the caller's transaction. Call dispatch() with the result after commit.
  async purge(
    manager: EntityManager,
    files: StoragePurgeFiles,
  ): Promise<string[]> {
    const media = files.media ?? [];
    const documents = files.documents ?? [];
    if (media.length === 0 && documents.length === 0) return [];

    const outbox: Partial<StoragePurgeJob>[] = [];
    const bytesByCompany = new Map<string, number>();
    const addBytes = (companyId: string, bytes: number) =>
      bytesByCompany.set(
        companyId,
        (bytesByCompany.get(companyId) ?? 0) + bytes,
      );

    for (const m of media) {
      addBytes(m.companyId, (m.fileSize ?? 0) + (m.thumbnailSize ?? 0));
      if (!m.s3Key) continue;
      outbox.push({
        companyId: m.companyId,
        bucketKind: StorageBucketKind.MEDIA,
        s3Key: m.s3Key,
        bytes: m.fileSize ?? 0,
        sourceType: 'PropertyMedia',
        sourceId: m.id,
      });
      outbox.push({
        companyId: m.companyId,
        bucketKind: StorageBucketKind.MEDIA,
        s3Key: getThumbnailKey(m.s3Key),
        bytes: m.thumbnailSize ?? 0,
        sourceType: 'PropertyMedia',
        sourceId: m.id,
      });
    }

    for (const d of documents) {
      addBytes(d.companyId, d.fileSize ?? 0);
      if (!d.s3Key) continue;
      outbox.push({
        companyId: d.companyId,
        bucketKind: StorageBucketKind.DOCUMENTS,
        s3Key: d.s3Key,
        bytes: d.fileSize ?? 0,
        sourceType: 'PropertyDocument',
        sourceId: d.id,
      });
    }

    let ids: string[] = [];
    if (outbox.length > 0) {
      const saved = await manager.save(
        StoragePurgeJob,
        manager.create(StoragePurgeJob, outbox),
      );
      ids = saved.map((row) => row.id);
    }

    const idsByCompany = <T extends { id: string; companyId: string }>(
      rows: T[],
    ) => {
      const map = new Map<string, string[]>();
      for (const row of rows) {
        const list = map.get(row.companyId) ?? [];
        list.push(row.id);
        map.set(row.companyId, list);
      }
      return map;
    };

    for (const [companyId, rowIds] of idsByCompany(media)) {
      await manager.delete(PropertyMedia, { companyId, id: In(rowIds) });
    }
    for (const [companyId, rowIds] of idsByCompany(documents)) {
      await manager.delete(PropertyDocument, { companyId, id: In(rowIds) });
    }

    // Sorted so concurrent purges lock company rows in the same order.
    for (const companyId of [...bytesByCompany.keys()].sort()) {
      const bytes = bytesByCompany.get(companyId)!;
      if (bytes <= 0) continue;
      await manager
        .createQueryBuilder()
        .update(Company)
        .set({
          storageUsedBytes: () => 'GREATEST("storage_used_bytes" - :bytes, 0)',
        })
        .setParameter('bytes', bytes)
        .where('id = :companyId', { companyId })
        .execute();
    }

    return ids;
  }

  // Never throws: StoragePurgeRequeueCron re-dispatches anything left PENDING.
  async dispatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.queue.addBulk(
        ids.map((id) => ({
          name: STORAGE_PURGE_JOB_NAME,
          data: { id },
          opts: {
            jobId: id,
            attempts: STORAGE_PURGE_MAX_ATTEMPTS,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: true,
            removeOnFail: true,
          },
        })),
      );
    } catch (err) {
      this.logger.error(
        `Failed to enqueue ${ids.length} storage purge job(s): ` +
          errorMessage(err),
      );
    }
  }
}
