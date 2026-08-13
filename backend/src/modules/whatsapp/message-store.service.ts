// backend/src/modules/whatsapp/message-store.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaMessage, WaChat } from './wa-types';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { WhatsappChat } from './entities/whatsapp-chat.entity';

const ALL_MESSAGES_LIMIT = 500;
const CHAT_MESSAGES_LIMIT = 200;
const CHAT_LIST_LIMIT = 300;
// last_ts is a one-way GREATEST latch: a future timestamp would freeze the preview.
const MAX_TS_SKEW_S = 300;

@Injectable()
export class MessageStoreService {
  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messages: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappChat)
    private readonly chats: Repository<WhatsappChat>,
  ) {}

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
    };
  }

  async addMessage(
    companyId: string,
    userId: string,
    msg: WaMessage,
  ): Promise<void> {
    const safeTs = String(
      Math.min(
        msg.timestamp ?? 0,
        Math.floor(Date.now() / 1000) + MAX_TS_SKEW_S,
      ),
    );

    // Both writes or neither: a message whose chat row is missing is invisible in the list.
    await this.messages.manager.transaction(async (manager) => {
      await manager
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
          timestamp: safeTs,
        })
        .orIgnore()
        .execute();

      // Raw SQL: orUpdate() cannot express the conditional preview columns. Column names
      // here are not checked by tsc, so mirror any rename in whatsapp-chat.entity.ts.
      // chat_name equal to chat_id is a placeholder, replaceable by a real pushName.
      await manager.query(
        `INSERT INTO "whatsapp_chats"
         ("company_id", "user_id", "chat_id", "chat_name", "is_group", "last_body", "last_ts", "last_from_me")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        ],
      );

      // Resolve the chat to a contact by its number, at most once per chat. The
      // JID for an individual chat is <number>@s.whatsapp.net (optionally
      // <number>:<device>@...); group chats (@g.us) have no person. Strip the
      // device suffix and host before normalising digits, then match on the last
      // 9. contact_resolution_attempted records that this ran, so an unsaved
      // number does not re-trigger the correlated subquery on every message.
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
    }));
  }

  // Driven off whatsapp_chats, never whatsapp_messages: addMessage writes both in one
  // transaction, so a message owner always has a chat row, and chats do not grow with
  // message volume.
  async findOwnersNeedingRecovery(): Promise<
    Array<{ companyId: string; userId: string }>
  > {
    const rows: Array<{ company_id: string; user_id: string }> =
      await this.chats.query(
        `SELECT DISTINCT c."company_id", c."user_id"
           FROM "whatsapp_chats" c
           LEFT JOIN "users" u ON u."id" = c."user_id"
          WHERE u."id" IS NULL OR u."is_active" = false`,
      );
    return rows.map((r) => ({ companyId: r.company_id, userId: r.user_id }));
  }
}
