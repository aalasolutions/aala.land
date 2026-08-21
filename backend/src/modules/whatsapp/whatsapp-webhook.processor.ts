import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { WaWebhookJobData, WA_WEBHOOK_EVENTS_QUEUE } from './wa-types';

@Processor(WA_WEBHOOK_EVENTS_QUEUE, { concurrency: 10 })
export class WhatsappWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappWebhookProcessor.name);

  constructor(private readonly webhook: WhatsappWebhookService) {
    super();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WaWebhookJobData> | undefined, err: Error): void {
    this.logger.error(
      `Webhook envelope job ${job?.id ?? 'unknown'} failed: ${err.message}`,
    );
  }

  // Per-message failures are swallowed inside processEnvelope; anything that escapes is
  // envelope-level, so letting it out hands the job back to BullMQ for a retry.
  async process(job: Job<WaWebhookJobData>): Promise<void> {
    await this.webhook.processEnvelope(job.data?.envelope);
  }
}
