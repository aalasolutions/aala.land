import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { WhatsappAiConversation } from './entities/whatsapp-ai-conversation.entity';

const RETENTION_MONTHS = 13;
const BATCH_SIZE = 5000;

/** Prunes at 13 months: a year for billing disputes, limits PII retention, deletes in batches. */
@Injectable()
export class AiConversationRetentionCron {
  private readonly logger = new Logger(AiConversationRetentionCron.name);

  constructor(
    @InjectRepository(WhatsappAiConversation)
    private readonly conversationRepo: Repository<WhatsappAiConversation>,
  ) {}

  @Cron('0 3 * * *')
  async run(): Promise<void> {
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);

    let total = 0;
    for (;;) {
      const batch = await this.conversationRepo.find({
        where: { periodStart: LessThan(cutoff) },
        select: { id: true },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;

      await this.conversationRepo.delete(batch.map((row) => row.id));
      total += batch.length;
      if (batch.length < BATCH_SIZE) break;
    }

    if (total > 0) {
      this.logger.log(
        `Pruned ${total} AI conversation row(s) older than ${cutoff.toISOString()}`,
      );
    }
  }
}
