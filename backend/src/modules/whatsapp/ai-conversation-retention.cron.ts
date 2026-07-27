import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { WhatsappAiConversation } from './entities/whatsapp-ai-conversation.entity';

const RETENTION_MONTHS = 13;
const BATCH_SIZE = 5000;

/**
 * Prunes whatsapp_ai_conversations, which holds one row per consumed AI credit and
 * would otherwise grow forever. Nothing reads past the current billing period plus
 * the console's trailing 30 days; 13 months keeps a full year for billing disputes.
 *
 * The rows carry chat_id (effectively a lead's phone number) and user_id, so this is
 * the data-retention path for that PII as well as a storage measure.
 *
 * Deletes in batches so the table is never locked for long. Assumes a single
 * scheduler instance, as UpcomingInvoiceCron does.
 */
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
