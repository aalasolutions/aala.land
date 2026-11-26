import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { errorMessage } from '@shared/utils/error.util';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { User } from '../users/entities/user.entity';
import {
  ESCALATION_REASONS,
  EscalationReason,
  WhatsappChatAiState,
} from './entities/whatsapp-chat-ai-state.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';
import { WhatsappGateway } from './whatsapp.gateway';
import { WaChatAiState } from './wa-types';
import { stripInvisible } from './whatsapp-ai-filter';
import {
  classifyOptSignals,
  OptClassification,
  OptLanguage,
} from './whatsapp-ai-opt-out';

export interface CustomerSignalResult extends OptClassification {
  changed: boolean;
}

export interface EscalationResult {
  escalated: boolean;
  notified: boolean;
}

export interface OptInResult {
  changed: boolean;
  language: OptLanguage | null;
}

export interface FlaggedChatAiState {
  chatId: string;
  escalatedAt: Date | null;
  escalationReason: EscalationReason | null;
  optedOutAt: Date | null;
}

interface FlagRow {
  chat_id: string;
  escalated_at: Date | null;
  escalation_reason: EscalationReason | null;
  opted_out_at: Date | null;
}

export const ESCALATION_REASON_LABELS: Record<EscalationReason, string> = {
  request: 'Asked for a person, a viewing or a booking',
  safety: 'Safety concern',
  payment: 'Payment or deposit question',
  complaint: 'Complaint',
  opt_out: 'Asked to stop messages',
  other: 'Needs the team',
};

export function toEscalationReason(value: unknown): EscalationReason {
  return (ESCALATION_REASONS as readonly unknown[]).includes(value)
    ? (value as EscalationReason)
    : 'other';
}

const FLAG_COLUMNS = `"chat_id", "escalated_at", "escalation_reason", "opted_out_at"`;
const KEY_WHERE = `"company_id" = $1 AND "user_id" = $2 AND "chat_id" = $3`;

function epochSeconds(value: Date | null): number | null {
  return value ? Math.floor(new Date(value).getTime() / 1000) : null;
}

@Injectable()
export class WhatsappChatAiStateService {
  private readonly logger = new Logger(WhatsappChatAiStateService.name);

  constructor(
    @InjectRepository(WhatsappChatAiState)
    private readonly states: Repository<WhatsappChatAiState>,
    @InjectRepository(WhatsappChat)
    private readonly chats: Repository<WhatsappChat>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly gateway: WhatsappGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async get(
    companyId: string,
    userId: string,
    chatId: string,
  ): Promise<WhatsappChatAiState | null> {
    return this.states.findOne({ where: { companyId, userId, chatId } });
  }

  async listFlagged(
    companyId: string,
    userId: string,
  ): Promise<FlaggedChatAiState[]> {
    const rows: FlagRow[] = await this.states.query(
      `SELECT ${FLAG_COLUMNS}
         FROM "whatsapp_chat_ai_states"
        WHERE "company_id" = $1 AND "user_id" = $2
          AND ("escalated_at" IS NOT NULL OR "opted_out_at" IS NOT NULL)`,
      [companyId, userId],
    );
    return rows.map((row) => ({
      chatId: row.chat_id,
      escalatedAt: row.escalated_at,
      escalationReason: row.escalation_reason,
      optedOutAt: row.opted_out_at,
    }));
  }

  async escalate(
    companyId: string,
    userId: string,
    chatId: string,
    reason: string,
  ): Promise<EscalationResult> {
    const safeReason = toEscalationReason(reason);
    const rows: FlagRow[] = await this.states.query(
      `INSERT INTO "whatsapp_chat_ai_states"
              ("company_id", "user_id", "chat_id", "escalated_at", "escalation_reason")
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT ("company_id", "user_id", "chat_id") DO UPDATE
          SET "escalated_at" = COALESCE("whatsapp_chat_ai_states"."escalated_at", EXCLUDED."escalated_at"),
              "escalation_reason" = EXCLUDED."escalation_reason",
              "escalation_notified_at" = NULL,
              "escalation_holding_sent_at" = CASE WHEN "whatsapp_chat_ai_states"."escalated_at" IS NULL
                THEN NULL ELSE "whatsapp_chat_ai_states"."escalation_holding_sent_at" END,
              "updated_at" = now()
        WHERE "whatsapp_chat_ai_states"."escalated_at" IS NULL
       RETURNING ${FLAG_COLUMNS}`,
      [companyId, userId, chatId, safeReason],
    );
    if (rows[0]) {
      this.emit(userId, rows[0]);
      const notified = await this.notifyEscalation(
        companyId,
        userId,
        chatId,
        safeReason,
      );
      return { escalated: true, notified };
    }
    const pending: { escalation_reason: string | null }[] =
      await this.states.query(
        `SELECT "escalation_reason"
           FROM "whatsapp_chat_ai_states"
          WHERE ${KEY_WHERE}
            AND "escalated_at" IS NOT NULL
            AND "escalation_notified_at" IS NULL`,
        [companyId, userId, chatId],
      );
    if (!pending[0]) return { escalated: false, notified: false };
    const notified = await this.notifyEscalation(
      companyId,
      userId,
      chatId,
      toEscalationReason(pending[0].escalation_reason),
    );
    return { escalated: false, notified };
  }

  // With repliedAt, only an escalation raised before that reply is cleared.
  async clearEscalation(
    companyId: string,
    userId: string,
    chatId: string,
    repliedAt?: Date,
  ): Promise<boolean> {
    const row = await this.updateAndEmit(
      userId,
      `UPDATE "whatsapp_chat_ai_states"
          SET "escalated_at" = NULL, "escalation_reason" = NULL,
              "escalation_notified_at" = NULL, "escalation_holding_sent_at" = NULL,
              "updated_at" = now()
        WHERE ${KEY_WHERE} AND "escalated_at" IS NOT NULL
          AND ($4::timestamptz IS NULL OR "escalated_at" < $4::timestamptz)
       RETURNING ${FLAG_COLUMNS}`,
      [companyId, userId, chatId, repliedAt ?? null],
    );
    return row !== null;
  }

  // Once per escalation, and only after the escalation has waited minAgeMs for a person.
  async claimHoldingReply(
    companyId: string,
    userId: string,
    chatId: string,
    minAgeMs: number,
  ): Promise<boolean> {
    const [rows]: [{ id: string }[], number] = await this.states.query(
      `UPDATE "whatsapp_chat_ai_states"
          SET "escalation_holding_sent_at" = now(), "updated_at" = now()
        WHERE ${KEY_WHERE}
          AND "escalated_at" IS NOT NULL
          AND "escalation_holding_sent_at" IS NULL
          AND "escalated_at" <= now() - ($4::int * interval '1 millisecond')
       RETURNING "id"`,
      [companyId, userId, chatId, Math.max(0, Math.floor(minAgeMs))],
    );
    return !!rows[0];
  }

  // One reminder per escalation: only when the first notification went out before the wait ended, so a second claim never matches.
  async claimEscalationReminder(
    companyId: string,
    userId: string,
    chatId: string,
    minAgeMs: number,
  ): Promise<boolean> {
    const [rows]: [FlagRow[], number] = await this.states.query(
      `UPDATE "whatsapp_chat_ai_states"
          SET "escalation_notified_at" = now(), "updated_at" = now()
        WHERE ${KEY_WHERE}
          AND "escalated_at" IS NOT NULL
          AND "escalation_notified_at" IS NOT NULL
          AND "escalated_at" <= now() - ($4::int * interval '1 millisecond')
          AND "escalation_notified_at" < "escalated_at" + ($4::int * interval '1 millisecond')
       RETURNING ${FLAG_COLUMNS}`,
      [companyId, userId, chatId, Math.max(0, Math.floor(minAgeMs))],
    );
    if (!rows[0]) return false;
    return this.notifyEscalation(
      companyId,
      userId,
      chatId,
      toEscalationReason(rows[0].escalation_reason),
      true,
    );
  }

  async optOut(
    companyId: string,
    userId: string,
    chatId: string,
    language: OptLanguage | null,
  ): Promise<boolean> {
    const rows: FlagRow[] = await this.states.query(
      `INSERT INTO "whatsapp_chat_ai_states"
              ("company_id", "user_id", "chat_id", "opted_out_at", "opt_out_language")
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT ("company_id", "user_id", "chat_id") DO UPDATE
          SET "opted_out_at" = EXCLUDED."opted_out_at",
              "opt_out_language" = EXCLUDED."opt_out_language",
              "opt_out_confirmed_at" = NULL,
              "updated_at" = now()
        WHERE "whatsapp_chat_ai_states"."opted_out_at" IS NULL
       RETURNING ${FLAG_COLUMNS}`,
      [companyId, userId, chatId, language],
    );
    if (!rows[0]) return false;
    this.emit(userId, rows[0]);
    return true;
  }

  async optIn(
    companyId: string,
    userId: string,
    chatId: string,
  ): Promise<OptInResult> {
    const row = await this.updateAndEmit<
      FlagRow & { opt_out_language: OptLanguage | null }
    >(
      userId,
      `UPDATE "whatsapp_chat_ai_states"
            SET "opted_out_at" = NULL, "opt_out_confirmed_at" = NULL, "updated_at" = now()
          WHERE ${KEY_WHERE} AND "opted_out_at" IS NOT NULL
         RETURNING ${FLAG_COLUMNS}, "opt_out_language"`,
      [companyId, userId, chatId],
    );
    return row
      ? { changed: true, language: row.opt_out_language }
      : { changed: false, language: null };
  }

  async claimOptOutConfirmation(
    companyId: string,
    userId: string,
    chatId: string,
  ): Promise<OptLanguage | null> {
    const [rows]: [{ opt_out_language: OptLanguage | null }[], number] =
      await this.states.query(
        `UPDATE "whatsapp_chat_ai_states"
            SET "opt_out_confirmed_at" = now(), "updated_at" = now()
          WHERE ${KEY_WHERE}
            AND "opted_out_at" IS NOT NULL
            AND "opt_out_confirmed_at" IS NULL
         RETURNING "opt_out_language"`,
        [companyId, userId, chatId],
      );
    if (!rows[0]) return null;
    return rows[0].opt_out_language ?? 'en';
  }

  // Exact STOP and START words only, for messages no AI turn will read.
  async applyCustomerSignals(
    companyId: string,
    userId: string,
    chatId: string,
    text: string,
  ): Promise<CustomerSignalResult> {
    const classification = classifyOptSignals(stripInvisible(text));
    if (classification.signal === 'opt_out') {
      const changed = await this.optOut(
        companyId,
        userId,
        chatId,
        classification.language,
      );
      return { ...classification, changed };
    }
    if (classification.signal === 'opt_in') {
      const { changed, language } = await this.optIn(companyId, userId, chatId);
      return {
        ...classification,
        language: language ?? classification.language,
        changed,
      };
    }
    return { ...classification, changed: false };
  }

  // An UPDATE ... RETURNING whose changed row is pushed to the dashboard.
  private async updateAndEmit<T extends FlagRow = FlagRow>(
    userId: string,
    sql: string,
    params: unknown[],
  ): Promise<T | null> {
    const [rows]: [T[], number] = await this.states.query(sql, params);
    if (!rows[0]) return null;
    this.emit(userId, rows[0]);
    return rows[0];
  }

  private emit(userId: string, row: FlagRow): void {
    const payload: WaChatAiState = {
      chatId: row.chat_id,
      aiEscalatedAt: epochSeconds(row.escalated_at),
      aiEscalationReason: row.escalation_reason,
      aiOptedOutAt: epochSeconds(row.opted_out_at),
    };
    try {
      this.gateway.emitChatAiState(userId, payload);
    } catch (err) {
      this.logger.error(`Chat AI state emit failed: ${errorMessage(err)}`);
    }
  }

  private async notifyEscalation(
    companyId: string,
    userId: string,
    chatId: string,
    reason: EscalationReason,
    reminder = false,
  ): Promise<boolean> {
    try {
      const owner = await this.users.findOne({
        where: { id: userId, companyId, isActive: true },
        select: { id: true },
      });
      if (!owner) {
        this.logger.warn(
          `Escalated chat ${chatId} has no active owner to notify`,
        );
        await this.markNotified(companyId, userId, chatId);
        return false;
      }
      const chat = await this.chats.findOne({
        where: { companyId, userId, chatId },
        select: { chatName: true },
      });
      const chatLabel = chat?.chatName?.trim() || chatId;
      await this.notifications.create(companyId, {
        userId,
        type: NotificationType.WHATSAPP_ESCALATION,
        title: reminder
          ? 'WhatsApp chat still needs a reply'
          : 'WhatsApp chat needs a reply',
        message: reminder
          ? `${chatLabel}: ${ESCALATION_REASON_LABELS[reason]}. The customer wrote again and is still waiting for a reply.`
          : `${chatLabel}: ${ESCALATION_REASON_LABELS[reason]}. Automatic replies are paused until someone replies.`,
        entityType: 'WhatsappChat',
      });
    } catch (err) {
      this.logger.error(`Escalation notification failed: ${errorMessage(err)}`);
      return false;
    }
    try {
      await this.markNotified(companyId, userId, chatId);
    } catch (err) {
      this.logger.error(
        `Escalation notified mark failed: ${errorMessage(err)}`,
      );
    }
    return true;
  }

  private async markNotified(
    companyId: string,
    userId: string,
    chatId: string,
  ): Promise<void> {
    await this.states.query(
      `UPDATE "whatsapp_chat_ai_states"
          SET "escalation_notified_at" = now(), "updated_at" = now()
        WHERE ${KEY_WHERE}
          AND "escalated_at" IS NOT NULL
          AND "escalation_notified_at" IS NULL`,
      [companyId, userId, chatId],
    );
  }
}
