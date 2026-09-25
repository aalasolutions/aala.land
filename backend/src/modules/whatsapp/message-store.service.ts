import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Or, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { WaMessage, WaChat, WaMessageWindow, WaUnreadState } from './wa-types';
import {
  WhatsappMessage,
  WhatsappMessageStatus,
} from './entities/whatsapp-message.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';

const MESSAGES_PAGE_DEFAULT = 50;
// Matches the stub the chat thread renders for a deleted message.
const DELETED_PREVIEW = 'This message was deleted';
const MESSAGES_PAGE_MAX = 200;
const CHAT_LIST_LIMIT = 300;
// last_ts is a one-way GREATEST latch: a future timestamp would freeze the preview.
const MAX_TS_SKEW_S = 300;
export const REPLY_WINDOW_S = 24 * 60 * 60;
// About 20 bind parameters per row; 500 rows stays well under Postgres's 65535 limit.
const HISTORY_INSERT_CHUNK = 500;

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

export interface HistoryMessage {
  msg: WaMessage;
  status?: WhatsappMessageStatus;
  statusAt?: Date;
}

interface ChatUnreadRow {
  unread_count: number | string;
  last_read_message_id: string | null;
}

// Same ladder in SQL, so the no-downgrade guard is evaluated inside the UPDATE.
const STATUS_RANK_SQL = `COALESCE(CASE "status" WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'played' THEN 4 WHEN 'failed' THEN 5 ELSE 0 END, 0)`;

// Raw SQL: orUpdate() can't express conditional columns; mirror renames in the entity
const CHAT_UPSERT_SQL = `INSERT INTO "whatsapp_chats"
         ("company_id", "user_id", "chat_id", "chat_name", "is_group", "last_body", "last_ts", "last_from_me", "phone_number_id", "last_inbound_at", "unread_count")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
         "unread_count" = "whatsapp_chats"."unread_count" + EXCLUDED."unread_count",
         "updated_at" = now()
       RETURNING "unread_count", "last_read_message_id"`;

// chat_id may be a legacy JID; contact_resolution_attempted stops the subquery from re-running per chat.
const CONTACT_RESOLVE_SQL = `UPDATE "whatsapp_chats"
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
             AND COALESCE("is_group", false) = false`;

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

  // status is written only on insert; the conflict path never touches an existing row.
  private toInsertValues(
    companyId: string,
    userId: string,
    msg: WaMessage,
    phoneNumberId: string | null | undefined,
    safeTs: string,
    insertStatus: { status?: WhatsappMessageStatus; statusAt?: Date },
  ): QueryDeepPartialEntity<WhatsappMessage> {
    return {
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
      ...(insertStatus.status
        ? {
            status: insertStatus.status,
            statusAt: insertStatus.statusAt ?? null,
          }
        : {}),
    };
  }

  // inserted is false when the row already existed (a Meta redelivery), true only on first insert.
  async addMessage(
    companyId: string,
    userId: string,
    msg: WaMessage,
    phoneNumberId?: string | null,
    // Passive store: never unread; opens Meta's reply window only when under 24h old.
    options: {
      isPassive?: boolean;
      // Written only when this call inserts the row, so a live row's status is never overwritten.
      status?: WhatsappMessageStatus;
      statusAt?: Date;
    } = {},
  ): Promise<{ inserted: boolean; unread: WaUnreadState }> {
    const isPassive = options.isPassive ?? false;
    const safeTs = String(
      Math.min(
        msg.timestamp ?? 0,
        Math.floor(Date.now() / 1000) + MAX_TS_SKEW_S,
      ),
    );
    // Meta's reply-window clock opens on inbound customer messages only.
    const opensWindow =
      !msg.fromMe &&
      (!isPassive ||
        Number(safeTs) > Math.floor(Date.now() / 1000) - REPLY_WINDOW_S);
    const lastInboundAt = opensWindow ? new Date(Number(safeTs) * 1000) : null;
    let inserted = false;
    let unread: WaUnreadState = {
      chatId: msg.chatId,
      unreadCount: 0,
      lastReadMessageId: null,
    };

    // Both writes or neither: a message whose chat row is missing is invisible in the list.
    await this.messages.manager.transaction(async (manager) => {
      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(WhatsappMessage)
        .values(
          this.toInsertValues(companyId, userId, msg, phoneNumberId, safeTs, {
            status: options.status,
            statusAt: options.statusAt,
          }),
        )
        .orIgnore()
        .execute();

      // orIgnore returns an empty raw array when the unique index already held the row.
      inserted = Array.isArray(insertResult.raw) && insertResult.raw.length > 0;

      const chatRows: ChatUnreadRow[] | undefined = await manager.query(
        CHAT_UPSERT_SQL,
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
          // Only a first delivery of a customer message counts as unread.
          inserted && !msg.fromMe && !isPassive ? 1 : 0,
        ],
      );
      const chat = chatRows?.[0];
      unread = {
        chatId: msg.chatId,
        unreadCount: Number(chat?.unread_count ?? 0),
        lastReadMessageId: chat?.last_read_message_id ?? null,
      };

      if (!msg.isGroup) {
        await manager.query(CONTACT_RESOLVE_SQL, [
          companyId,
          userId,
          msg.chatId,
        ]);
      }
    });

    return { inserted, unread };
  }

  // Synced history for one chat in one transaction; returns the ids this call inserted.
  async addHistoryMessages(
    companyId: string,
    userId: string,
    phoneNumberId: string | null | undefined,
    items: HistoryMessage[],
  ): Promise<string[]> {
    if (items.length === 0) return [];
    const { chatId } = items[0].msg;
    if (items.some((item) => item.msg.chatId !== chatId)) {
      throw new Error('addHistoryMessages accepts messages from one chat only');
    }

    const nowS = Math.floor(Date.now() / 1000);
    const rows = items.map((item) => ({
      item,
      safeTs: String(Math.min(item.msg.timestamp ?? 0, nowS + MAX_TS_SKEW_S)),
    }));
    // Ties go to the later row, matching addMessage's >= preview rule applied in order.
    const newest = rows.reduce((best, row) =>
      Number(row.safeTs) >= Number(best.safeTs) ? row : best,
    );
    // Passive rule: only a customer message under 24h old opens the reply window.
    const newestInboundS = rows.reduce<number | null>((max, row) => {
      const ts = Number(row.safeTs);
      if (row.item.msg.fromMe || ts <= nowS - REPLY_WINDOW_S) return max;
      return max === null || ts > max ? ts : max;
    }, null);
    // First meaningful name wins, as sequential upserts keep the first non-blank one.
    const chatName =
      items.find((item) => item.msg.chatName && item.msg.chatName !== chatId)
        ?.msg.chatName ?? '';
    const isGroup = items[items.length - 1].msg.isGroup ?? false;
    const insertedIds: string[] = [];

    await this.messages.manager.transaction(async (manager) => {
      for (let i = 0; i < rows.length; i += HISTORY_INSERT_CHUNK) {
        const insertResult = await manager
          .createQueryBuilder()
          .insert()
          .into(WhatsappMessage)
          .values(
            rows
              .slice(i, i + HISTORY_INSERT_CHUNK)
              .map(({ item, safeTs }) =>
                this.toInsertValues(
                  companyId,
                  userId,
                  item.msg,
                  phoneNumberId,
                  safeTs,
                  item,
                ),
              ),
          )
          .orIgnore()
          .returning('"wa_message_id"')
          .updateEntity(false)
          .execute();
        const raw = insertResult.raw as { wa_message_id: string }[];
        if (Array.isArray(raw)) {
          insertedIds.push(...raw.map((row) => row.wa_message_id));
        }
      }

      await manager.query(CHAT_UPSERT_SQL, [
        companyId,
        userId,
        chatId,
        chatName || chatId,
        isGroup,
        newest.item.msg.body ?? '',
        newest.safeTs,
        newest.item.msg.fromMe ?? false,
        phoneNumberId ?? null,
        newestInboundS === null ? null : new Date(newestInboundS * 1000),
        0,
      ]);

      if (!isGroup) {
        await manager.query(CONTACT_RESOLVE_SQL, [companyId, userId, chatId]);
      }
    });

    return insertedIds;
  }

  // Moves the read marker forward only and recomputes unread_count; null when the message is unknown.
  async markChatRead(
    companyId: string,
    userId: string,
    chatId: string,
    waMessageId: string,
  ): Promise<WaUnreadState | null> {
    return this.messages.manager.transaction(async (manager) => {
      const [target]: { timestamp: string; wa_message_id: string }[] =
        await manager.query(
          `SELECT "timestamp", "wa_message_id" FROM "whatsapp_messages"
            WHERE "company_id" = $1 AND "user_id" = $2 AND "chat_id" = $3 AND "wa_message_id" = $4`,
          [companyId, userId, chatId, waMessageId],
        );
      if (!target) return null;

      // Lock in its own statement; a lock wait rechecks only the locked row, so the compare needs a fresh snapshot.
      const [chat]: ChatUnreadRow[] = await manager.query(
        `SELECT "unread_count", "last_read_message_id" FROM "whatsapp_chats"
          WHERE "company_id" = $1 AND "user_id" = $2 AND "chat_id" = $3
          FOR UPDATE`,
        [companyId, userId, chatId],
      );
      if (!chat) return null;

      const [{ ahead }]: { ahead: boolean }[] = await manager.query(
        `SELECT EXISTS (
           SELECT 1 FROM "whatsapp_messages"
            WHERE "company_id" = $1 AND "user_id" = $2 AND "chat_id" = $3
              AND "wa_message_id" = $4
              AND ("timestamp", "wa_message_id") >= ($5::bigint, $6::varchar)
         ) AS "ahead"`,
        [
          companyId,
          userId,
          chatId,
          chat.last_read_message_id,
          target.timestamp,
          target.wa_message_id,
        ],
      );
      if (ahead) {
        return {
          chatId,
          unreadCount: Number(chat.unread_count),
          lastReadMessageId: chat.last_read_message_id,
        };
      }

      const [{ count }]: { count: number }[] = await manager.query(
        `SELECT COUNT(*)::int AS "count" FROM "whatsapp_messages"
          WHERE "company_id" = $1 AND "user_id" = $2 AND "chat_id" = $3
            AND "from_me" = false
            AND ("timestamp", "wa_message_id") > ($4::bigint, $5::varchar)`,
        [companyId, userId, chatId, target.timestamp, target.wa_message_id],
      );
      await manager.query(
        `UPDATE "whatsapp_chats"
            SET "last_read_message_id" = $4, "unread_count" = $5, "updated_at" = now()
          WHERE "company_id" = $1 AND "user_id" = $2 AND "chat_id" = $3`,
        [companyId, userId, chatId, target.wa_message_id, count],
      );
      return {
        chatId,
        unreadCount: Number(count),
        lastReadMessageId: target.wa_message_id,
      };
    });
  }

  // Status callbacks arrive out of order/redelivered; this only ever moves the status forward on the ladder.
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

  async hasMessage(
    companyId: string,
    userId: string,
    waMessageId: string,
  ): Promise<boolean> {
    return this.messages.exists({ where: { companyId, userId, waMessageId } });
  }

  async getMessage(
    companyId: string,
    userId: string,
    waMessageId: string,
  ): Promise<WaMessage | null> {
    const row = await this.messages.findOne({
      where: { companyId, userId, waMessageId },
    });
    return row ? this.toWaMessage(row) : null;
  }

  // Each side may only change its own messages, never a deleted one, never an older edit over a newer one.
  async applyEdit(
    companyId: string,
    userId: string,
    waMessageId: string,
    body: string,
    editedAt: Date,
    fromMe: boolean,
  ): Promise<boolean> {
    const result = await this.messages.update(
      {
        companyId,
        userId,
        waMessageId,
        fromMe,
        deletedAt: IsNull(),
        editedAt: Or(IsNull(), LessThan(editedAt)),
      },
      { body, editedAt },
    );
    const isApplied = (result.affected ?? 0) > 0;
    if (isApplied)
      await this.refreshChatPreview(companyId, userId, waMessageId, body);
    return isApplied;
  }

  // Delete for everyone; the row stays and renders as a stub. Each side may only delete its own messages.
  async markDeleted(
    companyId: string,
    userId: string,
    waMessageId: string,
    deletedAt: Date,
    fromMe: boolean,
  ): Promise<boolean> {
    const result = await this.messages.update(
      { companyId, userId, waMessageId, fromMe, deletedAt: IsNull() },
      { deletedAt },
    );
    const isApplied = (result.affected ?? 0) > 0;
    if (isApplied) {
      await this.refreshChatPreview(
        companyId,
        userId,
        waMessageId,
        DELETED_PREVIEW,
      );
    }
    return isApplied;
  }

  // Only when the changed message is still the chat's latest, since the preview shows only that one.
  private async refreshChatPreview(
    companyId: string,
    userId: string,
    waMessageId: string,
    lastBody: string,
  ): Promise<void> {
    await this.chats.query(
      `UPDATE "whatsapp_chats" c
          SET "last_body" = $4, "updated_at" = now()
         FROM "whatsapp_messages" m
        WHERE m."company_id" = $1
          AND m."user_id" = $2
          AND m."wa_message_id" = $3
          AND c."company_id" = m."company_id"
          AND c."user_id" = m."user_id"
          AND c."chat_id" = m."chat_id"
          AND c."last_ts" = m."timestamp"`,
      [companyId, userId, waMessageId, lastBody],
    );
  }

  // Page 1 is the newest slice; each page is returned oldest-first for rendering.
  async getAllMessages(
    companyId: string,
    userId: string,
    page = 1,
    limit = MESSAGES_PAGE_DEFAULT,
  ): Promise<{ messages: WaMessage[]; hasMore: boolean }> {
    const size = Math.min(Math.max(limit, 1), MESSAGES_PAGE_MAX);
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

  private pageSize(limit: number): number {
    return Math.min(Math.max(limit, 1), MESSAGES_PAGE_MAX);
  }

  private chatMessagesQuery(companyId: string, userId: string, chatId: string) {
    return this.messages
      .createQueryBuilder('m')
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.user_id = :userId', { userId })
      .andWhere('m.chat_id = :chatId', { chatId });
  }

  private async findCursor(
    companyId: string,
    userId: string,
    chatId: string,
    waMessageId: string,
  ): Promise<WhatsappMessage> {
    const cursor = await this.messages.findOne({
      where: { companyId, userId, chatId, waMessageId },
    });
    if (!cursor) throw new BadRequestException('Unknown message cursor');
    return cursor;
  }

  // Newest first when cursor is omitted.
  private olderRows(
    companyId: string,
    userId: string,
    chatId: string,
    take: number,
    cursor?: WhatsappMessage,
  ): Promise<WhatsappMessage[]> {
    const qb = this.chatMessagesQuery(companyId, userId, chatId);
    if (cursor) {
      qb.andWhere('(m.timestamp, m.wa_message_id) < (:cursorTs, :cursorId)', {
        cursorTs: cursor.timestamp,
        cursorId: cursor.waMessageId,
      });
    }
    return qb
      .orderBy('m.timestamp', 'DESC')
      .addOrderBy('m.wa_message_id', 'DESC')
      .take(take)
      .getMany();
  }

  private newerRows(
    companyId: string,
    userId: string,
    chatId: string,
    take: number,
    cursor: WhatsappMessage,
  ): Promise<WhatsappMessage[]> {
    return this.chatMessagesQuery(companyId, userId, chatId)
      .andWhere('(m.timestamp, m.wa_message_id) > (:cursorTs, :cursorId)', {
        cursorTs: cursor.timestamp,
        cursorId: cursor.waMessageId,
      })
      .orderBy('m.timestamp', 'ASC')
      .addOrderBy('m.wa_message_id', 'ASC')
      .take(take)
      .getMany();
  }

  // Keyset pagination
  async getMessagesForChat(
    companyId: string,
    userId: string,
    chatId: string,
    limit = MESSAGES_PAGE_DEFAULT,
    before?: string,
  ): Promise<{ messages: WaMessage[]; hasMore: boolean }> {
    const size = this.pageSize(limit);
    const cursor =
      before === undefined
        ? undefined
        : await this.findCursor(companyId, userId, chatId, before);
    const rows = await this.olderRows(
      companyId,
      userId,
      chatId,
      size + 1,
      cursor,
    );
    const hasMore = rows.length > size;
    if (hasMore) rows.pop();
    return {
      messages: rows.reverse().map((r) => this.toWaMessage(r)),
      hasMore,
    };
  }

  // The page immediately newer than `after`, ascending.
  async getMessagesAfter(
    companyId: string,
    userId: string,
    chatId: string,
    after: string,
    limit = MESSAGES_PAGE_DEFAULT,
  ): Promise<{ messages: WaMessage[]; hasMore: boolean }> {
    const size = this.pageSize(limit);
    const cursor = await this.findCursor(companyId, userId, chatId, after);
    const rows = await this.newerRows(
      companyId,
      userId,
      chatId,
      size + 1,
      cursor,
    );
    const hasMore = rows.length > size;
    if (hasMore) rows.pop();
    return { messages: rows.map((r) => this.toWaMessage(r)), hasMore };
  }

  // floor(limit/2) older, the anchor itself, the rest newer; ascending.
  async getMessagesAround(
    companyId: string,
    userId: string,
    chatId: string,
    around: string,
    limit = MESSAGES_PAGE_DEFAULT,
  ): Promise<WaMessageWindow> {
    const size = this.pageSize(limit);
    const olderSize = Math.floor(size / 2);
    const newerSize = size - olderSize - 1;
    const anchor = await this.findCursor(companyId, userId, chatId, around);

    const older = await this.olderRows(
      companyId,
      userId,
      chatId,
      olderSize + 1,
      anchor,
    );
    const newer = await this.newerRows(
      companyId,
      userId,
      chatId,
      newerSize + 1,
      anchor,
    );
    const hasMoreOlder = older.length > olderSize;
    if (hasMoreOlder) older.pop();
    const hasMoreNewer = newer.length > newerSize;
    if (hasMoreNewer) newer.pop();

    return {
      messages: [...older.reverse(), anchor, ...newer].map((r) =>
        this.toWaMessage(r),
      ),
      hasMoreOlder,
      hasMoreNewer,
    };
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
      unreadCount: Number(c.unreadCount ?? 0),
      lastReadMessageId: c.lastReadMessageId ?? null,
    }));
  }
}
