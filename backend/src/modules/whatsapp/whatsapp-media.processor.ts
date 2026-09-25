import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { envInt } from '@shared/utils/env.util';
import {
  WaMediaAwaitingConnectionError,
  WhatsappMediaIngestService,
} from './whatsapp-media-ingest.service';
import { WaMediaJobData, WA_MEDIA_QUEUE } from './wa-types';

const DEFAULT_CONCURRENCY = 3;

@Processor(WA_MEDIA_QUEUE, { concurrency: DEFAULT_CONCURRENCY })
export class WhatsappMediaProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(WhatsappMediaProcessor.name);

  constructor(private readonly ingestService: WhatsappMediaIngestService) {
    super();
  }

  // The worker exists only after onModuleInit; its run loop re-reads concurrency on every fetch.
  onApplicationBootstrap(): void {
    this.worker.concurrency = envInt(
      'WHATSAPP_MEDIA_CONCURRENCY',
      DEFAULT_CONCURRENCY,
      1,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WaMediaJobData> | undefined, err: Error): void {
    // Already logged by the ingest; the row is still PENDING.
    if (err instanceof WaMediaAwaitingConnectionError) return;
    const attempts = job?.opts?.attempts ?? 1;
    // Missing attempt data means we cannot prove a retry is coming, so treat it as final.
    const made = job?.attemptsMade ?? attempts;
    const final = err instanceof UnrecoverableError || made >= attempts;
    this.logger[final ? 'error' : 'warn'](
      `Media job ${job?.id ?? 'unknown'} for message ${job?.data?.messageUuid ?? 'unknown'} attempt ${made}/${attempts} failed${final ? ', media FAILED' : ''}: ${err.message}`,
    );
  }

  async process(job: Job<WaMediaJobData>): Promise<void> {
    await this.ingestService.ingest(
      job.data,
      job.attemptsMade ?? 0,
      job.opts?.attempts ?? 1,
    );
  }
}
