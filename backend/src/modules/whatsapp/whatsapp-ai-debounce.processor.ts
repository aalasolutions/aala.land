import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappCloudApiService } from './whatsapp-cloud-api.service';
import { DebounceJobData, WA_AI_DEBOUNCE_QUEUE } from './wa-types';
import { errorMessage } from '@shared/utils/error.util';

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
    const jobId = job.id;
    if (!jobId) throw new Error('Debounce job has no id');
    try {
      const buffered = await this.ai.takeDebouncedBuffer(job.data, jobId);
      if (!buffered) return;
      await this.ai.runTurn(
        job.data.companyId,
        job.data.userId,
        job.data.chatId,
        buffered.messageIds,
        buffered.combinedText,
        this.cloud.senderFor(job.data.companyId, job.data.userId),
        this.cloud.markReadFor(job.data.companyId, job.data.userId),
      );
    } catch (err) {
      // The claim or turn died outside its own guard, so this job's claimed messages go back on the buffer.
      await this.ai
        .restoreClaimedBuffer(job.data, jobId)
        .catch((restoreErr: unknown) =>
          this.logger.error(
            `Failed to restore the claimed buffer for ${job.data.userId}:${job.data.chatId}: ${errorMessage(restoreErr)}`,
          ),
        );
      throw err;
    }
    await this.ai.releaseClaimedBuffer(job.data, jobId);
  }
}
