import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  And,
  Equal,
  FindOptionsWhere,
  LessThan,
  MoreThan,
  Repository,
} from 'typeorm';
import {
  StoragePurgeJob,
  StoragePurgeStatus,
} from './entities/storage-purge-job.entity';
import { StoragePurgeService } from './storage-purge.service';

const STALE_AFTER_MS = 5 * 60 * 1000;
const BATCH_SIZE = 500;

/**
 * Re-enqueues outbox rows whose dispatch was lost (enqueue failure, Valkey
 * restart). A row whose job is still queued is a no-op, since jobId is the row id.
 */
@Injectable()
export class StoragePurgeRequeueCron {
  private readonly logger = new Logger(StoragePurgeRequeueCron.name);

  constructor(
    @InjectRepository(StoragePurgeJob)
    private readonly purgeJobRepository: Repository<StoragePurgeJob>,
    private readonly storagePurge: StoragePurgeService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);

    let total = 0;
    let cursor: { createdAt: Date; id: string } | null = null;
    for (;;) {
      // Keyset pagination on (createdAt, id) ascending: page N+1 resumes strictly
      // after the last row of page N, so rows workers mutate mid-scan are never skipped.
      const where: FindOptionsWhere<StoragePurgeJob>[] = cursor
        ? [
            {
              status: StoragePurgeStatus.PENDING,
              createdAt: And(LessThan(cutoff), MoreThan(cursor.createdAt)),
            },
            {
              status: StoragePurgeStatus.PENDING,
              createdAt: And(LessThan(cutoff), Equal(cursor.createdAt)),
              id: MoreThan(cursor.id),
            },
          ]
        : [
            {
              status: StoragePurgeStatus.PENDING,
              createdAt: LessThan(cutoff),
            },
          ];

      const batch = await this.purgeJobRepository.find({
        where,
        select: { id: true, createdAt: true },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;

      await this.storagePurge.dispatch(batch.map((row) => row.id));
      total += batch.length;

      const last = batch[batch.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };

      if (batch.length < BATCH_SIZE) break;
    }

    if (total > 0) {
      this.logger.log(`Re-dispatched ${total} pending storage purge job(s)`);
    }
  }
}
