import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappCloudApiService } from './whatsapp-cloud-api.service';
import { DebounceJobData, WA_AI_DEBOUNCE_QUEUE } from './wa-types';

@Processor(WA_AI_DEBOUNCE_QUEUE, { concurrency: 5 })
export class WhatsappAiDebounceProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsappAiDebounceProcessor.name);

  constructor(
    private readonly ai: WhatsappAiService,
    private readonly cloud: WhatsappCloudApiService,
  ) {
    super();
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DebounceJobData> | undefined, err: Error): void {
    this.logger.error(
      `Debounce turn ${job?.id ?? 'unknown'} failed for ${job?.data?.userId}:${job?.data?.chatId}: ${err.message}`,
    );
  }

  async process(job: Job<DebounceJobData>): Promise<void> {
    const buffered = await this.ai.takeDebouncedBuffer(job.data);
    if (!buffered) return;
    try {
      await this.ai.runTurn(
        job.data.companyId,
        job.data.userId,
        job.data.chatId,
        buffered.messageIds,
        buffered.combinedText,
        this.cloud.senderFor(job.data.userId),
        this.cloud.markReadFor(job.data.userId),
      );
    } catch (err) {
      // The turn died outside its own guard, so the lead's messages go back on the buffer.
      await this.ai
        .restoreClaimedBuffer(job.data)
        .catch((restoreErr: unknown) =>
          this.logger.error(
            `Failed to restore the claimed buffer for ${job.data.userId}:${job.data.chatId}: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`,
          ),
        );
      throw err;
    }
    await this.ai.releaseClaimedBuffer(job.data);
  }
}
