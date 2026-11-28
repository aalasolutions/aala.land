import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AiChatSummary } from './entities/ai-chat-summary.entity';

export interface AiChatKey {
  companyId: string;
  userId: string;
  channel: string;
  chatId: string;
}

@Injectable()
export class AiChatSummaryService {
  constructor(
    @InjectRepository(AiChatSummary)
    private readonly summaries: Repository<AiChatSummary>,
  ) {}

  async get(key: AiChatKey): Promise<AiChatSummary | null> {
    return this.summaries.findOne({
      where: {
        companyId: key.companyId,
        userId: key.userId,
        channel: key.channel,
        chatId: key.chatId,
      },
    });
  }

  // The manager lets the channel record the session start in its own intake transaction.
  async startSession(
    key: AiChatKey,
    startedAt: Date,
    previousInboundAt: Date,
    manager: EntityManager = this.summaries.manager,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO "ai_chat_summaries"
              ("company_id", "user_id", "channel", "chat_id", "session_started_at", "previous_inbound_at")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("company_id", "user_id", "channel", "chat_id") DO UPDATE
          SET "session_started_at" = EXCLUDED."session_started_at",
              "previous_inbound_at" = EXCLUDED."previous_inbound_at",
              "updated_at" = now()`,
      [
        key.companyId,
        key.userId,
        key.channel,
        key.chatId,
        startedAt,
        previousInboundAt,
      ],
    );
  }

  // Marks the session handled; a null summary keeps the stored one.
  async finishSession(
    key: AiChatKey,
    summarizedThrough: Date,
    summary: string | null,
  ): Promise<void> {
    await this.summaries.update(
      {
        companyId: key.companyId,
        userId: key.userId,
        channel: key.channel,
        chatId: key.chatId,
      },
      { summarizedThrough, ...(summary !== null && { summary }) },
    );
  }
}
