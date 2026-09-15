import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { StoragePurgeJob } from './entities/storage-purge-job.entity';
import { StoragePurgeService } from './storage-purge.service';
import { StoragePurgeProcessor } from './storage-purge.processor';
import { StoragePurgeRequeueCron } from './storage-purge-requeue.cron';
import { StorageQuotaReconcileCron } from './storage-quota-reconcile.cron';
import { STORAGE_PURGE_QUEUE } from './storage-purge.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([StoragePurgeJob]),
    BullModule.registerQueue({ name: STORAGE_PURGE_QUEUE }),
  ],
  providers: [
    StoragePurgeService,
    StoragePurgeProcessor,
    StoragePurgeRequeueCron,
    StorageQuotaReconcileCron,
  ],
  exports: [StoragePurgeService],
})
export class StoragePurgeModule {}
