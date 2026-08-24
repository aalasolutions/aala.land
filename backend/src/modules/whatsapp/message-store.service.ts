// backend/src/modules/whatsapp/message-store.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { WaMessage, WaChat } from './wa-types';
import {
  WhatsappMessage,
  WhatsappMessageStatus,
} from './entities/whatsapp-message.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';

const ALL_MESSAGES_LIMIT = 500;
const CHAT_MESSAGES_LIMIT = 200;
const CHAT_LIST_LIMIT = 300;
// last_ts is a one-way GREATEST latch: a future timestamp would freeze the preview.
const MAX_TS_SKEW_S = 300;

// Delivery ladder, forward only: failed tops it so a redelivered sent cannot resurrect.
const STATUS_RANK: Record<WhatsappMessageStatus, number> = {
  [WhatsappMessageStatus.SENT]: 1,
  [WhatsappMessageStatus.DELIVERED]: 2,
  [WhatsappMessageStatus.READ]: 3,
  [WhatsappMessageStatus.PLAYED]: 4,
  [WhatsappMessageStatus.FAILED]: 5,
};

// failed is a terminal fact that must land even on top of a read row; played wins by rank.
const ALWAYS_WRITE_STATUSES: WhatsappMessageStatus[] = [
  WhatsappMessageStatus.FAILED,
];

// Same ladder in SQL, so the no-downgrade guard is evaluated inside the UPDATE.
const STATUS_RANK_SQL = `COALESCE(CASE "status" WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'played' THEN 4 WHEN 'failed' THEN 5 ELSE 0 END, 0)`;

@Injectable()
export class MessageStoreService {
  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messages: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappChat)
    private readonly chats: Repository<WhatsappChat>,
  ) {}

  // timestamptz reads back as a Date; the wire format on this module is epoch seconds.
  private toEpochSeconds(value: Date | null | undefined): number | null {
    if (!value) return null;
    const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }

  private toWaMessage(row: WhatsappMessage): WaMessage {
    return {
      id: row.waMessageId,
      chatId: row.chatId,
      senderId: row.senderId,
      senderName: row.senderName,
      chatName: row.chatName,
      isGroup: row.isGroup,
      body: row.body,
      hasMedia: row.hasMedia,
      mediaType: row.mediaType,
      mediaUrls: row.mediaUrls ?? [],
      mentionedIds: row.mentionedIds ?? [],
      quotedParticipant: row.quotedParticipant,
      fromMe: row.fromMe,
      aiGenerated: row.aiGenerated,
      timestamp: Number(row.timestamp),
      originUserId: row.originUserId ?? row.userId,
      status: row.status ?? null,
      statusAt: this.toEpochSeconds(row.statusAt),
      errorCode: row.errorCode ?? null,
      editedAt: this.toEpochSeconds(row.editedAt),
      // Deliberately not filtered out of the read: the UI renders a deleted stub.
      deletedAt: this.toEpochSeconds(row.deletedAt),
    };
  }

  // Returns false when the unique index already held this wa_message_id, so a caller
  // can tell a first delivery from one of Meta's 7-day redeliveries.
  async addMessage(
    companyId: string,
    userId: string,
    msg: WaMessage,
    phoneNumberId?: string | null,
  ): Promise<boolean> {
    const safeTs = String(
      Math.min(
        msg.timestamp ?? 0,
        Math.floor(Date.now() / 1000) + MAX_TS_SKEW_S,
      ),
    );
    // Meta's reply-window clock opens on inbound customer messages only.
    const lastInboundAt = msg.fromMe ? null : new Date(Number(safeTs) * 1000);
    let inserted = false;

    // Both writes or neither: a message whose chat row is missing is invisible in the list.
    await this.messages.manager.transaction(async (manager) => {
      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(WhatsappMessage)
        .values({
          companyId,
          userId,
          originUserId: userId,
          waMessageId: msg.id,
          chatId: msg.chatId,
          senderId: msg.senderId ?? '',
          senderName: msg.senderName ?? '',
          chatName: msg.chatName ?? '',
          isGroup: msg.isGroup ?? false,
          body: msg.body ?? '',
          hasMedia: msg.hasMedia ?? false,
          mediaType: msg.mediaType ?? '',
          mediaUrls: msg.mediaUrls ?? [],
          mentionedIds: msg.mentionedIds ?? [],
          quotedParticipant: msg.quotedParticipant ?? '',
          fromMe: msg.fromMe ?? false,
          aiGenerated: msg.aiGenerated ?? false,
          phoneNumberId: phoneNumberId ?? null,
          timestamp: safeTs,
        })
        .orIgnore()
        .execute();

      // orIgnore returns an empty raw array when the unique index already held the row.
      inserted = Array.isArray(insertResult.raw) && insertResult.raw.length > 0;

      // Raw SQL: orUpdate() cannot express the conditional preview columns. Column names
      // here are not checked by tsc, so mirror any rename in whatsapp-chat.entity.ts.
      // chat_name equal to chat_id is a placeholder, replaceable by a real pushName.
      await manager.query(
        `INSERT INTO "whatsapp_chats"
         ("company_id", "user_id", "chat_id", "chat_name", "is_group", "last_body", "last_ts", "last_from_me", "phone_number_id", "last_inbound_at")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT ("company_id", "user_id", "chat_id") DO UPDATE SET
         "chat_name" = COALESCE(
           NULLIF(NULLIF("whatsapp_chats"."chat_name", ''), "whatsapp_chats"."chat_id"),
           NULLIF(EXCLUDED."chat_name", ''),
           EXCLUDED."chat_id"
         ),
         "is_group" = EXCLUDED."is_group",
         "last_body" = CASE WHEN EXCLUDED."last_ts" >= "whatsapp_chats"."last_ts" THEN EXCLUDED."last_body" ELSE "whatsapp_chats"."last_body" END,
         "last_from_me" = CASE WHEN EXCLUDED."last_ts" >= "whatsapp_chats"."last_ts" THEN EXCLUDED."last_from_me" ELSE "whatsapp_chats"."last_from_me" END,
         "last_ts" = GREATEST(EXCLUDED."last_ts", "whatsapp_chats"."last_ts"),
         "phone_number_id" = COALESCE(EXCLUDED."phone_number_id", "whatsapp_chats"."phone_number_id"),
         "last_inbound_at" = GREATEST(EXCLUDED."last_inbound_at", "whatsapp_chats"."last_inbound_at"),
         "updated_at" = now()`,
        [
          companyId,
          userId,
          msg.chatId,
          msg.chatName || msg.chatId,
          msg.isGroup ?? false,
          msg.body ?? '',
          safeTs,
          msg.fromMe ?? false,
          phoneNumberId ?? null,
          lastInboundAt,
        ],
      );

      // chat_id is bare E.164 digits on Cloud API rows; the split_part calls strip the JID suffix only on legacy Baileys-era rows.
      // Matched on the last 9 digits, once per chat: contact_resolution_attempted stops an unsaved number re-running the subquery.
      if (!msg.isGroup) {
        await manager.query(
          `UPDATE "whatsapp_chats"
             SET
               "contact_id" = (
                 SELECT c."id"
                   FROM "contacts" c
                  WHERE c."company_id" = $1
                    AND c."phone" IS NOT NULL
                    AND RIGHT(regexp_replace(c."phone", '\\D', '', 'g'), 9)
                      = RIGHT(
                          regexp_replace(
                            split_part(split_part($3, '@', 1), ':', 1),
                            '\\D', '', 'g'
                          ),
                          9
                        )
                  LIMIT 1
               ),
               "contact_resolution_attempted" = true
           WHERE "company_id" = $1
             AND "user_id" = $2
             AND "chat_id" = $3
             AND "contact_id" IS NULL
             AND COALESCE("contact_resolution_attempted", false) = false
             AND COALESCE("is_group", false) = false`,
          [companyId, userId, msg.chatId],
        );
      }
    });

    return inserted;
  }

  // Status callbacks arrive out of order and are redelivered, so this only ever moves
  // a message forward on the delivery ladder. Returns false when nothing was written,
  // which means either an unknown wa_message_id or a status older than the stored one.
  async applyMessageStatus(
    companyId: string,
    userId: string,
    waMessageId: string,
    status: WhatsappMessageStatus,
    statusAt: Date,
    errorCode: string | null,
  ): Promise<boolean> {
    const patch: QueryDeepPartialEntity<WhatsappMessage> = { status, statusAt };
    if (errorCode) patch.errorCode = errorCode;

    const result = await this.messages.manager
      .createQueryBuilder()
      .update(WhatsappMessage)
      .set(patch)
      .where('company_id = :companyId', { companyId })
      .andWhere('user_id = :userId', { userId })
      .andWhere('wa_message_id = :waMessageId', { waMessageId })
      .andWhere(`(:always = true OR ${STATUS_RANK_SQL} < :rank)`, {
        always: ALWAYS_WRITE_STATUSES.includes(status),
        rank: STATUS_RANK[status],
      })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  // Page 1 is the newest slice; each page is returned oldest-first for rendering.
  async getAllMessages(
    companyId: string,
    userId: string,
    page = 1,
    limit = ALL_MESSAGES_LIMIT,
  ): Promise<{ messages: WaMessage[]; hasMore: boolean }> {
    const size = Math.min(Math.max(limit, 1), ALL_MESSAGES_LIMIT);
    const rows = await this.messages.find({
      where: { companyId, userId },
      order: { timestamp: 'DESC', createdAt: 'DESC' },
      skip: (Math.max(page, 1) - 1) * size,
      take: size + 1,
    });
    const hasMore = rows.length > size;
    if (hasMore) rows.pop();
    return {
      messages: rows.reverse().map((r) => this.toWaMessage(r)),
      hasMore,
    };
  }

  async getMessagesForChat(
    companyId: string,
    userId: string,
    chatId: string,
    limit = CHAT_MESSAGES_LIMIT,
  ): Promise<WaMessage[]> {
    const rows = await this.messages.find({
      where: { companyId, userId, chatId },
      order: { timestamp: 'DESC', createdAt: 'DESC' },
      take: limit,
    });
    return rows.reverse().map((r) => this.toWaMessage(r));
  }

  // excludeWaIds: the current turn's messages, which the caller appends itself.
  async getChatHistory(
    companyId: string,
    userId: string,
    chatId: string,
    limit: number,
    excludeWaIds: string[] = [],
  ): Promise<WaMessage[]> {
    const qb = this.messages
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.user_id = :userId', { userId })
      .andWhere('m.chat_id = :chatId', { chatId })
      .andWhere("m.body <> ''");

    if (excludeWaIds.length > 0) {
      qb.andWhere('m.wa_message_id NOT IN (:...excludeWaIds)', {
        excludeWaIds,
      });
    }

    const rows = await qb
      .orderBy('m.timestamp', 'DESC')
      .addOrderBy('m.created_at', 'DESC')
      .take(limit)
      .getMany();

    return rows.reverse().map((r) => this.toWaMessage(r));
  }

  async getChatList(
    companyId: string,
    userId: string,
    limit = CHAT_LIST_LIMIT,
  ): Promise<WaChat[]> {
    const rows = await this.chats.find({
      where: { companyId, userId, isGroup: false },
      order: { lastTs: 'DESC' },
      take: limit,
    });
    return rows.map((c) => ({
      chatId: c.chatId,
      chatName: c.chatName || c.chatId,
      isGroup: c.isGroup,
      lastBody: c.lastBody,
      lastTs: Number(c.lastTs),
      lastFromMe: c.lastFromMe,
      lastInboundAt: this.toEpochSeconds(c.lastInboundAt),
    }));
  }
}
