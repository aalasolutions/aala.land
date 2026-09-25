// backend/src/modules/whatsapp/message-store.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { MessageStoreService } from './message-store.service';
import { WaMessage } from './wa-types';
import {
  WhatsappMessage,
  WhatsappMessageStatus,
} from './entities/whatsapp-message.entity';

const makeMsg = (overrides: Partial<WaMessage> = {}): WaMessage => ({
  id: 'msg-1',
  chatId: '971501234567@s.whatsapp.net',
  senderId: '971501234567@s.whatsapp.net',
  senderName: 'Ahmed',
  chatName: 'Ahmed',
  isGroup: false,
  body: 'Hello',
  hasMedia: false,
  mediaType: '',
  mediaUrls: [],
  mentionedIds: [],
  quotedParticipant: '',
  fromMe: false,
  aiGenerated: false,
  timestamp: 1700000000,
  ...overrides,
});

// Rows come back from pg with bigint columns as strings.
const makeRow = (overrides: Partial<WhatsappMessage> = {}) =>
  ({
    id: 'row-1',
    companyId: 'co-1',
    userId: 'user-a',
    originUserId: 'user-a',
    waMessageId: 'msg-1',
    chatId: 'chat-a',
    senderId: 's1',
    senderName: 'Ahmed',
    chatName: 'Ahmed',
    isGroup: false,
    body: 'Hello',
    hasMedia: false,
    mediaType: '',
    mediaUrls: [],
    mentionedIds: [],
    quotedParticipant: '',
    fromMe: false,
    aiGenerated: false,
    timestamp: '1700000000',
    createdAt: new Date(),
    ...overrides,
  }) as WhatsappMessage;

describe('MessageStoreService', () => {
  let service: MessageStoreService;
  let insertBuilder: any;
  let selectBuilder: any;
  let updateBuilder: any;
  let txManager: any;
  let messagesRepo: any;
  let chatsRepo: any;

  beforeEach(() => {
    // Postgres RETURNING gives back a row on a real insert and nothing on ON CONFLICT DO NOTHING.
    insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [{ id: 'row-1' }] }),
    };
    updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    selectBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    txManager = {
      createQueryBuilder: jest.fn(() => insertBuilder),
      // The chat upsert RETURNs the unread state.
      query: jest
        .fn()
        .mockResolvedValue([{ unread_count: 3, last_read_message_id: 'm0' }]),
    };
    messagesRepo = {
      manager: {
        transaction: jest.fn((cb: (m: unknown) => Promise<void>) =>
          cb(txManager),
        ),
        createQueryBuilder: jest.fn(() => updateBuilder),
      },
      createQueryBuilder: jest.fn(() => selectBuilder),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    chatsRepo = {
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue([]),
    };
    service = new MessageStoreService(messagesRepo, chatsRepo);
  });

  describe('addMessage', () => {
    it('persists the message scoped to company and agent', async () => {
      await service.addMessage('co-1', 'user-a', makeMsg({ id: 'm1' }));

      const values = insertBuilder.values.mock.calls[0][0];
      expect(values.companyId).toBe('co-1');
      expect(values.userId).toBe('user-a');
      expect(values.waMessageId).toBe('m1');
      expect(values.timestamp).toBe('1700000000');
    });

    it('stamps the producing agent so a later move cannot erase attribution', async () => {
      await service.addMessage('co-1', 'user-a', makeMsg());

      expect(insertBuilder.values.mock.calls[0][0].originUserId).toBe('user-a');
    });

    it('ignores conflicts so Baileys re-delivery cannot duplicate a row', async () => {
      await service.addMessage('co-1', 'user-a', makeMsg());
      expect(insertBuilder.orIgnore).toHaveBeenCalled();
    });

    it('writes the message and the chat preview in one transaction', async () => {
      await service.addMessage('co-1', 'user-a', makeMsg());

      expect(messagesRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(insertBuilder.execute).toHaveBeenCalled();
      expect(txManager.query).toHaveBeenCalled();
    });

    it('passes the chat preview values through', async () => {
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ chatId: 'chat-a', body: 'second', timestamp: 200 }),
      );

      const params = txManager.query.mock.calls[0][1];
      expect(params[0]).toBe('co-1');
      expect(params[1]).toBe('user-a');
      expect(params[2]).toBe('chat-a');
      expect(params[5]).toBe('second');
      expect(params[6]).toBe('200');
    });

    it('falls back to the chat id when the chat has no name', async () => {
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ chatId: 'chat-a', chatName: '' }),
      );
      expect(txManager.query.mock.calls[0][1][3]).toBe('chat-a');
    });

    it('clamps a future timestamp before it reaches either write', async () => {
      const future = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ timestamp: future }),
      );

      const ceiling = Math.floor(Date.now() / 1000) + 300;
      expect(
        Number(insertBuilder.values.mock.calls[0][0].timestamp),
      ).toBeLessThanOrEqual(ceiling);
      expect(Number(txManager.query.mock.calls[0][1][6])).toBeLessThanOrEqual(
        ceiling,
      );
    });

    it('reports a first delivery as inserted', async () => {
      await expect(
        service.addMessage('co-1', 'user-a', makeMsg()),
      ).resolves.toMatchObject({ inserted: true });
    });

    it('reports a redelivery as not inserted so the caller can skip it', async () => {
      insertBuilder.execute.mockResolvedValue({ raw: [] });

      await expect(
        service.addMessage('co-1', 'user-a', makeMsg()),
      ).resolves.toMatchObject({ inserted: false });
    });

    it('increments unread_count in the chat upsert on the first delivery of an inbound message', async () => {
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ chatId: 'chat-a', fromMe: false }),
      );

      const [sql, params] = txManager.query.mock.calls[0];
      expect(params[10]).toBe(1);
      expect(sql).toContain(
        `"unread_count" = "whatsapp_chats"."unread_count" + EXCLUDED."unread_count"`,
      );
      expect(sql).toContain(`RETURNING "unread_count", "last_read_message_id"`);
    });

    it('returns the unread state the upsert RETURNed', async () => {
      const out = await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ chatId: 'chat-a' }),
      );

      expect(out.unread).toEqual({
        chatId: 'chat-a',
        unreadCount: 3,
        lastReadMessageId: 'm0',
      });
    });

    it('does not increment unread_count on a redelivery', async () => {
      insertBuilder.execute.mockResolvedValue({ raw: [] });

      await service.addMessage('co-1', 'user-a', makeMsg({ fromMe: false }));

      expect(txManager.query.mock.calls[0][1][10]).toBe(0);
    });

    it('does not increment unread_count on an outbound message', async () => {
      await service.addMessage('co-1', 'user-a', makeMsg({ fromMe: true }));

      expect(txManager.query.mock.calls[0][1][10]).toBe(0);
    });

    it('stamps phone_number_id on the message and the chat row', async () => {
      await service.addMessage('co-1', 'user-a', makeMsg(), 'phone-1');

      expect(insertBuilder.values.mock.calls[0][0].phoneNumberId).toBe(
        'phone-1',
      );
      expect(txManager.query.mock.calls[0][1][8]).toBe('phone-1');
    });

    it('leaves phone_number_id null when the caller has none', async () => {
      await service.addMessage('co-1', 'user-a', makeMsg());

      expect(insertBuilder.values.mock.calls[0][0].phoneNumberId).toBeNull();
      expect(txManager.query.mock.calls[0][1][8]).toBeNull();
    });

    it('opens the reply-window clock on an inbound message', async () => {
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ fromMe: false, timestamp: 1700000000 }),
      );

      const lastInboundAt = txManager.query.mock.calls[0][1][9] as Date;
      expect(lastInboundAt).toBeInstanceOf(Date);
      expect(lastInboundAt.getTime()).toBe(1700000000 * 1000);
    });

    it('does not touch the reply-window clock on an outbound message', async () => {
      await service.addMessage('co-1', 'user-a', makeMsg({ fromMe: true }));

      expect(txManager.query.mock.calls[0][1][9]).toBeNull();
    });

    it('keeps the stored reply-window clock when the new value is null', async () => {
      await service.addMessage('co-1', 'user-a', makeMsg({ fromMe: true }));

      const sql = txManager.query.mock.calls[0][0] as string;
      expect(sql).toContain(
        `"last_inbound_at" = GREATEST(EXCLUDED."last_inbound_at", "whatsapp_chats"."last_inbound_at")`,
      );
      expect(sql).toContain(
        `"phone_number_id" = COALESCE(EXCLUDED."phone_number_id", "whatsapp_chats"."phone_number_id")`,
      );
    });
  });

  describe('addMessage passive (synced history)', () => {
    it('never counts a history message as unread', async () => {
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ fromMe: false }),
        'phone-1',
        { isPassive: true },
      );

      expect(txManager.query.mock.calls[0][1][10]).toBe(0);
    });

    it('writes a given status only as part of the insert', async () => {
      const statusAt = new Date(1700000000 * 1000);
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ fromMe: true }),
        'phone-1',
        { isPassive: true, status: WhatsappMessageStatus.READ, statusAt },
      );
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ fromMe: true }),
        'phone-1',
        { isPassive: true },
      );

      const [withStatus, without] = insertBuilder.values.mock.calls.map(
        (c) => c[0],
      );
      expect(withStatus).toMatchObject({ status: 'read', statusAt });
      expect(without).not.toHaveProperty('status');
      expect(insertBuilder.orIgnore).toHaveBeenCalled();
    });

    it('never opens the reply-window clock for a history message over 24h old', async () => {
      const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ fromMe: false, timestamp: twoDaysAgo }),
        'phone-1',
        { isPassive: true },
      );

      expect(txManager.query.mock.calls[0][1][9]).toBeNull();
    });

    it('opens the reply-window clock for a customer history message under 24h old', async () => {
      const hourAgo = Math.floor(Date.now() / 1000) - 60 * 60;
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ fromMe: false, timestamp: hourAgo }),
        'phone-1',
        { isPassive: true },
      );

      const lastInboundAt = txManager.query.mock.calls[0][1][9] as Date;
      expect(lastInboundAt.getTime()).toBe(hourAgo * 1000);
      expect(txManager.query.mock.calls[0][1][10]).toBe(0);
    });

    it('never opens the reply-window clock for our own recent history message', async () => {
      const hourAgo = Math.floor(Date.now() / 1000) - 60 * 60;
      await service.addMessage(
        'co-1',
        'user-a',
        makeMsg({ fromMe: true, timestamp: hourAgo }),
        'phone-1',
        { isPassive: true },
      );

      expect(txManager.query.mock.calls[0][1][9]).toBeNull();
    });
  });

  describe('addHistoryMessages', () => {
    const hourAgo = () => Math.floor(Date.now() / 1000) - 60 * 60;
    const chatParams = () => txManager.query.mock.calls[0][1];

    beforeEach(() => {
      insertBuilder.returning = jest.fn().mockReturnThis();
      insertBuilder.updateEntity = jest.fn().mockReturnThis();
      insertBuilder.execute = jest.fn(() =>
        Promise.resolve({
          raw: insertBuilder.values.mock.calls
            .at(-1)[0]
            .map((row: { waMessageId: string }) => ({
              wa_message_id: row.waMessageId,
            })),
        }),
      );
    });

    it('stores the whole thread in one transaction and returns the inserted ids', async () => {
      const ids = await service.addHistoryMessages(
        'co-1',
        'user-a',
        'phone-1',
        [{ msg: makeMsg({ id: 'h1' }) }, { msg: makeMsg({ id: 'h2' }) }],
      );

      expect(ids).toEqual(['h1', 'h2']);
      expect(messagesRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(insertBuilder.values).toHaveBeenCalledTimes(1);
      expect(insertBuilder.orIgnore).toHaveBeenCalled();
      expect(insertBuilder.returning).toHaveBeenCalledWith('"wa_message_id"');
    });

    it('returns no ids when the unique index already held every row', async () => {
      insertBuilder.execute = jest.fn().mockResolvedValue({ raw: [] });

      const ids = await service.addHistoryMessages(
        'co-1',
        'user-a',
        'phone-1',
        [{ msg: makeMsg({ id: 'h1' }) }],
      );

      expect(ids).toEqual([]);
    });

    it('writes a given status only as part of the insert', async () => {
      const statusAt = new Date(1700000000 * 1000);
      await service.addHistoryMessages('co-1', 'user-a', 'phone-1', [
        {
          msg: makeMsg({ id: 'ours', fromMe: true }),
          status: WhatsappMessageStatus.READ,
          statusAt,
        },
        { msg: makeMsg({ id: 'theirs' }) },
      ]);

      const [ours, theirs] = insertBuilder.values.mock.calls[0][0];
      expect(ours).toMatchObject({ status: 'read', statusAt });
      expect(theirs).not.toHaveProperty('status');
      expect(insertBuilder.orIgnore).toHaveBeenCalled();
    });

    it('splits a large thread into chunked inserts inside the same transaction', async () => {
      const items = Array.from({ length: 1201 }, (_, i) => ({
        msg: makeMsg({ id: `h${i}` }),
      }));

      const ids = await service.addHistoryMessages(
        'co-1',
        'user-a',
        'phone-1',
        items,
      );

      const sizes = insertBuilder.values.mock.calls.map((c) => c[0].length);
      expect(sizes).toEqual([500, 500, 201]);
      expect(ids).toHaveLength(1201);
      expect(messagesRepo.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('upserts the chat once with the newest message as the preview and no unread', async () => {
      await service.addHistoryMessages('co-1', 'user-a', 'phone-1', [
        { msg: makeMsg({ id: 'h2', body: 'newest', timestamp: 1700000200 }) },
        { msg: makeMsg({ id: 'h1', body: 'older', timestamp: 1700000100 }) },
      ]);

      const upserts = txManager.query.mock.calls.filter((c) =>
        String(c[0]).includes('INSERT INTO "whatsapp_chats"'),
      );
      expect(upserts).toHaveLength(1);
      const params = chatParams();
      expect(params[5]).toBe('newest');
      expect(params[6]).toBe('1700000200');
      expect(params[8]).toBe('phone-1');
      expect(params[10]).toBe(0);
    });

    it('breaks a timestamp tie toward the later message, as sequential upserts do', async () => {
      await service.addHistoryMessages('co-1', 'user-a', 'phone-1', [
        { msg: makeMsg({ id: 'h1', body: 'first', timestamp: 1700000000 }) },
        {
          msg: makeMsg({
            id: 'h2',
            body: 'second',
            fromMe: true,
            timestamp: 1700000000,
          }),
        },
      ]);

      expect(chatParams()[5]).toBe('second');
      expect(chatParams()[7]).toBe(true);
    });

    it('clamps a future timestamp before it can freeze the preview', async () => {
      const future = Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60;
      await service.addHistoryMessages('co-1', 'user-a', 'phone-1', [
        { msg: makeMsg({ id: 'h1', timestamp: future }) },
      ]);

      const stored = Number(insertBuilder.values.mock.calls[0][0][0].timestamp);
      expect(stored).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 300);
      expect(chatParams()[6]).toBe(String(stored));
    });

    it('opens the reply window from the newest customer message under 24h old only', async () => {
      const recent = hourAgo();
      const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
      await service.addHistoryMessages('co-1', 'user-a', 'phone-1', [
        { msg: makeMsg({ id: 'old', timestamp: twoDaysAgo }) },
        { msg: makeMsg({ id: 'recent', timestamp: recent - 60 }) },
        { msg: makeMsg({ id: 'newer', timestamp: recent }) },
        { msg: makeMsg({ id: 'ours', fromMe: true, timestamp: recent + 60 }) },
      ]);

      expect((chatParams()[9] as Date).getTime()).toBe(recent * 1000);
    });

    it('never opens the reply window for old or own history', async () => {
      const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
      await service.addHistoryMessages('co-1', 'user-a', 'phone-1', [
        { msg: makeMsg({ id: 'old', timestamp: twoDaysAgo }) },
        { msg: makeMsg({ id: 'ours', fromMe: true, timestamp: hourAgo() }) },
      ]);

      expect(chatParams()[9]).toBeNull();
    });

    it('keeps the first meaningful chat name and falls back to the chat id', async () => {
      const chatId = '971501234567';
      await service.addHistoryMessages('co-1', 'user-a', 'phone-1', [
        { msg: makeMsg({ id: 'h1', chatId, chatName: '' }) },
        { msg: makeMsg({ id: 'h2', chatId, chatName: 'Ahmed' }) },
        { msg: makeMsg({ id: 'h3', chatId, chatName: 'Later' }) },
      ]);
      expect(chatParams()[3]).toBe('Ahmed');

      txManager.query.mockClear();
      await service.addHistoryMessages('co-1', 'user-a', 'phone-1', [
        { msg: makeMsg({ id: 'h4', chatId, chatName: '' }) },
      ]);
      expect(chatParams()[3]).toBe(chatId);
    });

    it('resolves the contact for a one-to-one chat', async () => {
      await service.addHistoryMessages('co-1', 'user-a', 'phone-1', [
        { msg: makeMsg({ id: 'h1' }) },
      ]);

      expect(txManager.query).toHaveBeenCalledTimes(2);
      expect(txManager.query.mock.calls[1][0]).toContain('"contact_id"');
    });

    it('rejects messages from more than one chat', async () => {
      await expect(
        service.addHistoryMessages('co-1', 'user-a', 'phone-1', [
          { msg: makeMsg({ id: 'h1', chatId: 'a' }) },
          { msg: makeMsg({ id: 'h2', chatId: 'b' }) },
        ]),
      ).rejects.toThrow('one chat');
      expect(messagesRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('does nothing for an empty thread', async () => {
      await expect(
        service.addHistoryMessages('co-1', 'user-a', 'phone-1', []),
      ).resolves.toEqual([]);
      expect(messagesRepo.manager.transaction).not.toHaveBeenCalled();
    });
  });

  describe('echo edit and revoke', () => {
    beforeEach(() => {
      messagesRepo.update = jest.fn().mockResolvedValue({ affected: 1 });
    });

    it('applyEdit rewrites only our own live row, never over a newer edit', async () => {
      const at = new Date(1761000200 * 1000);

      await expect(
        service.applyEdit('co-1', 'user-a', 'wamid.1', 'new text', at, true),
      ).resolves.toBe(true);
      const [where, patch] = messagesRepo.update.mock.calls[0];
      expect(where).toMatchObject({
        companyId: 'co-1',
        userId: 'user-a',
        waMessageId: 'wamid.1',
        fromMe: true,
      });
      expect(where.deletedAt).toBeDefined();
      expect(where.editedAt).toBeDefined();
      expect(patch).toEqual({ body: 'new text', editedAt: at });
    });

    it('getMessage reads one message inside the caller company and agent', async () => {
      messagesRepo.findOne.mockResolvedValue(makeRow({ waMessageId: 'msg-1' }));

      const msg = await service.getMessage('co-1', 'user-a', 'msg-1');

      expect(messagesRepo.findOne).toHaveBeenCalledWith({
        where: { companyId: 'co-1', userId: 'user-a', waMessageId: 'msg-1' },
      });
      expect(msg?.id).toBe('msg-1');
    });

    it('hasMessage checks inside the caller company and agent', async () => {
      messagesRepo.exists = jest.fn().mockResolvedValue(true);

      await expect(
        service.hasMessage('co-1', 'user-a', 'wamid.1'),
      ).resolves.toBe(true);
      expect(messagesRepo.exists).toHaveBeenCalledWith({
        where: { companyId: 'co-1', userId: 'user-a', waMessageId: 'wamid.1' },
      });
    });

    it('markDeleted stamps deleted_at once and keeps the row', async () => {
      const at = new Date(1761000200 * 1000);

      await service.markDeleted('co-1', 'user-a', 'wamid.1', at, false);

      const [where, patch] = messagesRepo.update.mock.calls[0];
      expect(where).toMatchObject({
        companyId: 'co-1',
        userId: 'user-a',
        waMessageId: 'wamid.1',
        fromMe: false,
      });
      expect(where.deletedAt).toBeDefined();
      expect(patch).toEqual({ deletedAt: at });
    });

    it('an applied delete refreshes the chat preview only if it was the latest message', async () => {
      await service.markDeleted('co-1', 'user-a', 'wamid.1', new Date(), false);

      const [sql, params] = chatsRepo.query.mock.calls[0];
      expect(sql).toContain('c."last_ts" = m."timestamp"');
      expect(params).toEqual([
        'co-1',
        'user-a',
        'wamid.1',
        'This message was deleted',
      ]);
    });

    it('an applied edit puts the new text in the chat preview', async () => {
      await service.applyEdit(
        'co-1',
        'user-a',
        'wamid.1',
        'TWO',
        new Date(),
        false,
      );

      expect(chatsRepo.query.mock.calls[0][1]).toEqual([
        'co-1',
        'user-a',
        'wamid.1',
        'TWO',
      ]);
    });

    it('a change that matched no row leaves the chat preview alone', async () => {
      messagesRepo.update.mockResolvedValue({ affected: 0 });

      await service.applyEdit(
        'co-1',
        'user-a',
        'wamid.1',
        'TWO',
        new Date(),
        false,
      );

      expect(chatsRepo.query).not.toHaveBeenCalled();
    });

    it('reports false when no stored message matched', async () => {
      messagesRepo.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.markDeleted(
          'co-1',
          'user-a',
          'wamid.missing',
          new Date(),
          true,
        ),
      ).resolves.toBe(false);
    });
  });

  describe('markChatRead', () => {
    const target = { timestamp: '500', wa_message_id: 'wamid.X' };

    it('looks the message up inside the caller company, agent and chat', async () => {
      txManager.query.mockReset().mockResolvedValueOnce([]);

      await service.markChatRead('co-1', 'user-a', 'chat-a', 'wamid.X');

      expect(txManager.query.mock.calls[0][1]).toEqual([
        'co-1',
        'user-a',
        'chat-a',
        'wamid.X',
      ]);
    });

    it('returns null for an unknown message and writes nothing', async () => {
      txManager.query.mockReset().mockResolvedValueOnce([]);

      await expect(
        service.markChatRead('co-1', 'user-a', 'chat-a', 'wamid.none'),
      ).resolves.toBeNull();
      expect(txManager.query).toHaveBeenCalledTimes(1);
    });

    it('locks the chat row alone, then compares markers in a separate statement', async () => {
      txManager.query
        .mockReset()
        .mockResolvedValueOnce([target])
        .mockResolvedValueOnce([
          { unread_count: 4, last_read_message_id: 'wamid.old' },
        ])
        .mockResolvedValueOnce([{ ahead: false }])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce(undefined);

      await service.markChatRead('co-1', 'user-a', 'chat-a', 'wamid.X');

      const [lockSql, lockParams] = txManager.query.mock.calls[1];
      expect(lockSql).toContain('FROM "whatsapp_chats"');
      expect(lockSql).toContain('FOR UPDATE');
      expect(lockSql).not.toContain('JOIN');
      expect(lockParams).toEqual(['co-1', 'user-a', 'chat-a']);

      const [compareSql, compareParams] = txManager.query.mock.calls[2];
      expect(compareSql).not.toContain('FOR UPDATE');
      expect(compareSql).toContain(
        '("timestamp", "wa_message_id") >= ($5::bigint, $6::varchar)',
      );
      expect(compareParams).toEqual([
        'co-1',
        'user-a',
        'chat-a',
        'wamid.old',
        '500',
        'wamid.X',
      ]);
      expect(messagesRepo.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('returns null and writes nothing when the chat row is missing', async () => {
      txManager.query
        .mockReset()
        .mockResolvedValueOnce([target])
        .mockResolvedValueOnce([]);

      await expect(
        service.markChatRead('co-1', 'user-a', 'chat-a', 'wamid.X'),
      ).resolves.toBeNull();
      expect(txManager.query).toHaveBeenCalledTimes(2);
    });

    it('advances the marker and recomputes the count of inbound messages after it', async () => {
      txManager.query
        .mockReset()
        .mockResolvedValueOnce([target])
        .mockResolvedValueOnce([
          { unread_count: 9, last_read_message_id: 'wamid.old' },
        ])
        .mockResolvedValueOnce([{ ahead: false }])
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce(undefined);

      const out = await service.markChatRead(
        'co-1',
        'user-a',
        'chat-a',
        'wamid.X',
      );

      expect(out).toEqual({
        chatId: 'chat-a',
        unreadCount: 2,
        lastReadMessageId: 'wamid.X',
      });
      const [countSql, countParams] = txManager.query.mock.calls[3];
      expect(countSql).toContain('"from_me" = false');
      expect(countSql).toContain(
        '("timestamp", "wa_message_id") > ($4::bigint, $5::varchar)',
      );
      expect(countParams).toEqual(['co-1', 'user-a', 'chat-a', '500', 'wamid.X']);
      expect(txManager.query.mock.calls[4][1]).toEqual([
        'co-1',
        'user-a',
        'chat-a',
        'wamid.X',
        2,
      ]);
    });

    it('ignores a marker behind the stored one and returns the current state', async () => {
      txManager.query
        .mockReset()
        .mockResolvedValueOnce([target])
        .mockResolvedValueOnce([
          { unread_count: '1', last_read_message_id: 'wamid.newer' },
        ])
        .mockResolvedValueOnce([{ ahead: true }]);

      const out = await service.markChatRead(
        'co-1',
        'user-a',
        'chat-a',
        'wamid.X',
      );

      expect(out).toEqual({
        chatId: 'chat-a',
        unreadCount: 1,
        lastReadMessageId: 'wamid.newer',
      });
      expect(txManager.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('applyMessageStatus', () => {
    const statusAt = new Date('2026-08-21T10:00:00.000Z');

    const whereArgs = () =>
      updateBuilder.andWhere.mock.calls.map((c: any[]) => c[1]);

    it('scopes the update to company, agent and wa_message_id', async () => {
      await service.applyMessageStatus(
        'co-1',
        'user-a',
        'wamid.1',
        WhatsappMessageStatus.DELIVERED,
        statusAt,
        null,
      );

      expect(updateBuilder.where).toHaveBeenCalledWith(
        'company_id = :companyId',
        { companyId: 'co-1' },
      );
      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        'user_id = :userId',
        { userId: 'user-a' },
      );
      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        'wa_message_id = :waMessageId',
        { waMessageId: 'wamid.1' },
      );
    });

    it('guards the ladder so a stale status cannot downgrade a stored one', async () => {
      await service.applyMessageStatus(
        'co-1',
        'user-a',
        'wamid.1',
        WhatsappMessageStatus.SENT,
        statusAt,
        null,
      );

      const guard = updateBuilder.andWhere.mock.calls.find((c: any[]) =>
        (c[0] as string).includes(':always'),
      );
      expect(guard[1]).toEqual({ always: false, rank: 1 });
      expect(guard[0]).toContain(`WHEN 'delivered' THEN 2`);
    });

    it('ranks failed above played above read above delivered above sent', async () => {
      for (const [status, rank] of [
        [WhatsappMessageStatus.SENT, 1],
        [WhatsappMessageStatus.DELIVERED, 2],
        [WhatsappMessageStatus.READ, 3],
        [WhatsappMessageStatus.PLAYED, 4],
      ] as [WhatsappMessageStatus, number][]) {
        updateBuilder.andWhere.mockClear();
        await service.applyMessageStatus(
          'co-1',
          'user-a',
          'wamid.1',
          status,
          statusAt,
          null,
        );
        expect(whereArgs()).toContainEqual({ always: false, rank });
      }
    });

    // failed must land on a row already read, which the rank comparison alone would refuse.
    it('always writes failed, the one terminal fact that can arrive out of order', async () => {
      await service.applyMessageStatus(
        'co-1',
        'user-a',
        'wamid.1',
        WhatsappMessageStatus.FAILED,
        statusAt,
        null,
      );

      expect(whereArgs()).toContainEqual({ always: true, rank: 5 });
    });

    it('carries the whole ladder into the SQL guard so no rung falls back to zero', async () => {
      await service.applyMessageStatus(
        'co-1',
        'user-a',
        'wamid.1',
        WhatsappMessageStatus.SENT,
        statusAt,
        null,
      );

      const guard = updateBuilder.andWhere.mock.calls.find((c: any[]) =>
        (c[0] as string).includes(':always'),
      );
      expect(guard[0]).toContain(`WHEN 'played' THEN 4`);
      expect(guard[0]).toContain(`WHEN 'failed' THEN 5`);
    });

    it('ranks read below played so a late read cannot downgrade a played row', async () => {
      await service.applyMessageStatus(
        'co-1',
        'user-a',
        'wamid.1',
        WhatsappMessageStatus.READ,
        statusAt,
        null,
      );

      expect(whereArgs()).toContainEqual({ always: false, rank: 3 });
    });

    it('stores the error code only when one was supplied', async () => {
      await service.applyMessageStatus(
        'co-1',
        'user-a',
        'wamid.1',
        WhatsappMessageStatus.FAILED,
        statusAt,
        '131042',
      );
      expect(updateBuilder.set).toHaveBeenCalledWith({
        status: WhatsappMessageStatus.FAILED,
        statusAt,
        errorCode: '131042',
      });

      updateBuilder.set.mockClear();
      await service.applyMessageStatus(
        'co-1',
        'user-a',
        'wamid.1',
        WhatsappMessageStatus.READ,
        statusAt,
        null,
      );
      expect(updateBuilder.set).toHaveBeenCalledWith({
        status: WhatsappMessageStatus.READ,
        statusAt,
      });
    });

    it('reports false when nothing was written', async () => {
      updateBuilder.execute.mockResolvedValue({ affected: 0 });

      await expect(
        service.applyMessageStatus(
          'co-1',
          'user-a',
          'wamid.unknown',
          WhatsappMessageStatus.READ,
          statusAt,
          null,
        ),
      ).resolves.toBe(false);
    });

    it('reports true when a row moved forward', async () => {
      await expect(
        service.applyMessageStatus(
          'co-1',
          'user-a',
          'wamid.1',
          WhatsappMessageStatus.READ,
          statusAt,
          null,
        ),
      ).resolves.toBe(true);
    });
  });

  describe('reads', () => {
    it('getMessagesForChat scopes by company, agent and chat', async () => {
      await service.getMessagesForChat('co-1', 'user-a', 'chat-a');
      expect(selectBuilder.where).toHaveBeenCalledWith(
        'm.company_id = :companyId',
        { companyId: 'co-1' },
      );
      expect(selectBuilder.andWhere).toHaveBeenCalledWith(
        'm.user_id = :userId',
        { userId: 'user-a' },
      );
      expect(selectBuilder.andWhere).toHaveBeenCalledWith(
        'm.chat_id = :chatId',
        { chatId: 'chat-a' },
      );
    });

    it('getMessagesForChat defaults to 50, probes one extra row, and caps at 200', async () => {
      await service.getMessagesForChat('co-1', 'user-a', 'chat-a');
      expect(selectBuilder.take).toHaveBeenLastCalledWith(51);

      await service.getMessagesForChat('co-1', 'user-a', 'chat-a', 10_000);
      expect(selectBuilder.take).toHaveBeenLastCalledWith(201);
    });

    it('getMessagesForChat orders newest first on timestamp then message id, no offset', async () => {
      await service.getMessagesForChat('co-1', 'user-a', 'chat-a');
      expect(selectBuilder.orderBy).toHaveBeenCalledWith('m.timestamp', 'DESC');
      expect(selectBuilder.addOrderBy).toHaveBeenCalledWith(
        'm.wa_message_id',
        'DESC',
      );
      expect(messagesRepo.findOne).not.toHaveBeenCalled();
    });

    it('getMessagesForChat returns the page ascending and reports hasMore from the probe row', async () => {
      selectBuilder.getMany.mockResolvedValue([
        makeRow({ waMessageId: 'newest', timestamp: '300' }),
        makeRow({ waMessageId: 'middle', timestamp: '200' }),
        makeRow({ waMessageId: 'probe', timestamp: '100' }),
      ]);

      const out = await service.getMessagesForChat('co-1', 'user-a', 'chat-a', 2);

      expect(out.hasMore).toBe(true);
      expect(out.messages.map((m) => m.id)).toEqual(['middle', 'newest']);
    });

    it('getMessagesForChat reports hasMore false when the chat is exhausted', async () => {
      selectBuilder.getMany.mockResolvedValue([makeRow(), makeRow()]);

      const out = await service.getMessagesForChat('co-1', 'user-a', 'chat-a', 2);

      expect(out.hasMore).toBe(false);
      expect(out.messages).toHaveLength(2);
    });

    it('before resolves the cursor inside the same company, agent and chat', async () => {
      messagesRepo.findOne.mockResolvedValue(
        makeRow({ waMessageId: 'wamid.X', timestamp: '500' }),
      );

      await service.getMessagesForChat('co-1', 'user-a', 'chat-a', 50, 'wamid.X');

      expect(messagesRepo.findOne.mock.calls[0][0].where).toEqual({
        companyId: 'co-1',
        userId: 'user-a',
        chatId: 'chat-a',
        waMessageId: 'wamid.X',
      });
    });

    it('before returns strictly older rows, using the message id to break a timestamp tie', async () => {
      messagesRepo.findOne.mockResolvedValue(
        makeRow({ waMessageId: 'wamid.X', timestamp: '500' }),
      );

      await service.getMessagesForChat('co-1', 'user-a', 'chat-a', 50, 'wamid.X');

      expect(selectBuilder.andWhere).toHaveBeenCalledWith(
        '(m.timestamp, m.wa_message_id) < (:cursorTs, :cursorId)',
        { cursorTs: '500', cursorId: 'wamid.X' },
      );
      expect(selectBuilder.take).toHaveBeenLastCalledWith(51);
    });

    it('before rejects an unknown id or one from another chat, agent or company', async () => {
      messagesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getMessagesForChat('co-1', 'user-a', 'chat-a', 50, 'wamid.other'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(selectBuilder.getMany).not.toHaveBeenCalled();
    });

    it('after returns the newer page ascending, scoped, with the probe row dropped', async () => {
      messagesRepo.findOne.mockResolvedValue(
        makeRow({ waMessageId: 'wamid.X', timestamp: '500' }),
      );
      selectBuilder.getMany.mockResolvedValue([
        makeRow({ waMessageId: 'n1', timestamp: '600' }),
        makeRow({ waMessageId: 'n2', timestamp: '700' }),
        makeRow({ waMessageId: 'probe', timestamp: '800' }),
      ]);

      const out = await service.getMessagesAfter(
        'co-1',
        'user-a',
        'chat-a',
        'wamid.X',
        2,
      );

      expect(out).toEqual({
        messages: [
          expect.objectContaining({ id: 'n1' }),
          expect.objectContaining({ id: 'n2' }),
        ],
        hasMore: true,
      });
      expect(messagesRepo.findOne.mock.calls[0][0].where).toEqual({
        companyId: 'co-1',
        userId: 'user-a',
        chatId: 'chat-a',
        waMessageId: 'wamid.X',
      });
      expect(selectBuilder.where).toHaveBeenCalledWith(
        'm.company_id = :companyId',
        { companyId: 'co-1' },
      );
      expect(selectBuilder.andWhere).toHaveBeenCalledWith(
        '(m.timestamp, m.wa_message_id) > (:cursorTs, :cursorId)',
        { cursorTs: '500', cursorId: 'wamid.X' },
      );
      expect(selectBuilder.orderBy).toHaveBeenCalledWith('m.timestamp', 'ASC');
      expect(selectBuilder.addOrderBy).toHaveBeenCalledWith(
        'm.wa_message_id',
        'ASC',
      );
      expect(selectBuilder.take).toHaveBeenLastCalledWith(3);
    });

    it('after reports hasMore false at the newest end', async () => {
      messagesRepo.findOne.mockResolvedValue(makeRow({ waMessageId: 'wamid.X' }));
      selectBuilder.getMany.mockResolvedValue([makeRow({ waMessageId: 'n1' })]);

      const out = await service.getMessagesAfter(
        'co-1',
        'user-a',
        'chat-a',
        'wamid.X',
        2,
      );

      expect(out.hasMore).toBe(false);
    });

    it('after rejects an unknown or foreign cursor', async () => {
      messagesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getMessagesAfter('co-1', 'user-a', 'chat-a', 'wamid.other'),
      ).rejects.toThrow('Unknown message cursor');
      expect(selectBuilder.getMany).not.toHaveBeenCalled();
    });

    it('around returns older, the anchor, then newer ascending with both flags', async () => {
      messagesRepo.findOne.mockResolvedValue(
        makeRow({ waMessageId: 'anchor', timestamp: '500' }),
      );
      // limit 5: 2 older + anchor + 2 newer, each probed with one extra row.
      selectBuilder.getMany
        .mockResolvedValueOnce([
          makeRow({ waMessageId: 'o1', timestamp: '400' }),
          makeRow({ waMessageId: 'o2', timestamp: '300' }),
          makeRow({ waMessageId: 'o-probe', timestamp: '200' }),
        ])
        .mockResolvedValueOnce([makeRow({ waMessageId: 'n1', timestamp: '600' })]);

      const out = await service.getMessagesAround(
        'co-1',
        'user-a',
        'chat-a',
        'anchor',
        5,
      );

      expect(out.messages.map((m) => m.id)).toEqual(['o2', 'o1', 'anchor', 'n1']);
      expect(out.hasMoreOlder).toBe(true);
      expect(out.hasMoreNewer).toBe(false);
      expect(selectBuilder.take.mock.calls.map((c: number[]) => c[0])).toEqual([
        3, 3,
      ]);
      expect(selectBuilder.andWhere).toHaveBeenCalledWith(
        '(m.timestamp, m.wa_message_id) < (:cursorTs, :cursorId)',
        { cursorTs: '500', cursorId: 'anchor' },
      );
      expect(selectBuilder.andWhere).toHaveBeenCalledWith(
        '(m.timestamp, m.wa_message_id) > (:cursorTs, :cursorId)',
        { cursorTs: '500', cursorId: 'anchor' },
      );
    });

    it('around with limit 4 takes 2 older and 1 newer', async () => {
      messagesRepo.findOne.mockResolvedValue(makeRow({ waMessageId: 'anchor' }));
      selectBuilder.getMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeRow({ waMessageId: 'n1', timestamp: '1700000001' }),
          makeRow({ waMessageId: 'n-probe', timestamp: '1700000002' }),
        ]);

      const out = await service.getMessagesAround(
        'co-1',
        'user-a',
        'chat-a',
        'anchor',
        4,
      );

      expect(selectBuilder.take.mock.calls.map((c: number[]) => c[0])).toEqual([
        3, 2,
      ]);
      expect(out.messages.map((m) => m.id)).toEqual(['anchor', 'n1']);
      expect(out.hasMoreOlder).toBe(false);
      expect(out.hasMoreNewer).toBe(true);
    });

    it('around rejects an unknown or foreign cursor', async () => {
      messagesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getMessagesAround('co-1', 'user-b', 'chat-a', 'wamid.other'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(messagesRepo.findOne.mock.calls[0][0].where.userId).toBe('user-b');
      expect(selectBuilder.getMany).not.toHaveBeenCalled();
    });

    it('getAllMessages scopes by company and agent', async () => {
      await service.getAllMessages('co-1', 'user-a');
      expect(messagesRepo.find.mock.calls[0][0].where).toEqual({
        companyId: 'co-1',
        userId: 'user-a',
      });
    });

    it('getAllMessages reports truncation without counting the table', async () => {
      messagesRepo.find.mockResolvedValue([
        makeRow({ waMessageId: 'a', timestamp: '300' }),
        makeRow({ waMessageId: 'b', timestamp: '200' }),
        makeRow({ waMessageId: 'c', timestamp: '100' }),
      ]);

      const out = await service.getAllMessages('co-1', 'user-a', 1, 2);

      expect(out.hasMore).toBe(true);
      expect(out.messages).toHaveLength(2);
      expect(messagesRepo.findAndCount).not.toHaveBeenCalled();
    });

    it('getAllMessages drops the probe row, not a row the caller should see', async () => {
      messagesRepo.find.mockResolvedValue([
        makeRow({ waMessageId: 'newest', timestamp: '300' }),
        makeRow({ waMessageId: 'middle', timestamp: '200' }),
        makeRow({ waMessageId: 'probe', timestamp: '100' }),
      ]);

      const out = await service.getAllMessages('co-1', 'user-a', 1, 2);

      expect(out.messages.map((m) => m.id)).toEqual(['middle', 'newest']);
    });

    it('getAllMessages reports the last page as exhausted', async () => {
      messagesRepo.find.mockResolvedValue([makeRow(), makeRow()]);

      const out = await service.getAllMessages('co-1', 'user-a', 1, 2);

      expect(out.hasMore).toBe(false);
      expect(out.messages).toHaveLength(2);
    });

    it('getAllMessages fetches one extra row, offsets by page, and caps the page size', async () => {
      await service.getAllMessages('co-1', 'user-a', 3, 10_000);

      const opts = messagesRepo.find.mock.calls[0][0];
      expect(opts.take).toBe(201);
      expect(opts.skip).toBe(400);
    });

    it('getAllMessages floors a page below 1 rather than passing a negative offset', async () => {
      await service.getAllMessages('co-1', 'user-a', 0, 50);

      expect(messagesRepo.find.mock.calls[0][0].skip).toBe(0);
    });

    it('returns messages oldest-first and maps the bigint timestamp to a number', async () => {
      selectBuilder.getMany.mockResolvedValue([
        makeRow({ waMessageId: 'newer', timestamp: '200' }),
        makeRow({ waMessageId: 'older', timestamp: '100' }),
      ]);

      const { messages: out } = await service.getMessagesForChat(
        'co-1',
        'user-a',
        'chat-a',
      );

      expect(out.map((m) => m.id)).toEqual(['older', 'newer']);
      expect(out[0].timestamp).toBe(100);
      expect(typeof out[0].timestamp).toBe('number');
    });

    it('surfaces the original agent on a row that has been moved to someone else', async () => {
      selectBuilder.getMany.mockResolvedValue([
        makeRow({ userId: 'user-b', originUserId: 'user-a' }),
      ]);

      const { messages: out } = await service.getMessagesForChat(
        'co-1',
        'user-b',
        'chat-a',
      );

      expect(out[0].originUserId).toBe('user-a');
    });

    it('falls back to the holder when a row predates origin tracking', async () => {
      selectBuilder.getMany.mockResolvedValue([
        makeRow({ userId: 'user-b', originUserId: null }),
      ]);

      const { messages: out } = await service.getMessagesForChat(
        'co-1',
        'user-b',
        'chat-a',
      );

      expect(out[0].originUserId).toBe('user-b');
    });

    it('getChatList excludes groups and maps lastTs to a number', async () => {
      chatsRepo.find.mockResolvedValue([
        {
          chatId: 'chat-a',
          chatName: 'Ahmed',
          isGroup: false,
          lastBody: 'hi',
          lastTs: '200',
          lastFromMe: false,
        },
      ]);

      const list = await service.getChatList('co-1', 'user-a');

      expect(chatsRepo.find.mock.calls[0][0].where).toEqual({
        companyId: 'co-1',
        userId: 'user-a',
        isGroup: false,
      });
      expect(list[0].lastTs).toBe(200);
    });

    it('getChatList carries lastInboundAt as epoch seconds so the client can size the reply window', async () => {
      chatsRepo.find.mockResolvedValue([
        {
          chatId: 'chat-a',
          chatName: 'Ahmed',
          isGroup: false,
          lastBody: 'hi',
          lastTs: '200',
          lastFromMe: false,
          lastInboundAt: new Date('2026-08-21T10:00:00.000Z'),
        },
      ]);

      const list = await service.getChatList('co-1', 'user-a');

      expect(list[0].lastInboundAt).toBe(
        Math.floor(Date.parse('2026-08-21T10:00:00.000Z') / 1000),
      );
    });

    it('getChatList reports a chat the customer never wrote in as null, not zero', async () => {
      chatsRepo.find.mockResolvedValue([
        {
          chatId: 'chat-a',
          chatName: 'Ahmed',
          isGroup: false,
          lastBody: 'hi',
          lastTs: '200',
          lastFromMe: true,
          lastInboundAt: null,
        },
      ]);

      const list = await service.getChatList('co-1', 'user-a');

      expect(list[0].lastInboundAt).toBeNull();
    });

    it('getChatList carries unreadCount and lastReadMessageId', async () => {
      chatsRepo.find.mockResolvedValue([
        {
          chatId: 'chat-a',
          chatName: 'Ahmed',
          isGroup: false,
          lastBody: 'hi',
          lastTs: '200',
          lastFromMe: false,
          lastInboundAt: null,
          unreadCount: 4,
          lastReadMessageId: 'wamid.X',
        },
      ]);

      const list = await service.getChatList('co-1', 'user-a');

      expect(list[0].unreadCount).toBe(4);
      expect(list[0].lastReadMessageId).toBe('wamid.X');
    });

    it('carries the delivery status, its timestamp and the error code onto the payload', async () => {
      selectBuilder.getMany.mockResolvedValue([
        makeRow({
          fromMe: true,
          status: WhatsappMessageStatus.FAILED,
          statusAt: new Date('2026-08-21T10:00:00.000Z'),
          errorCode: '131047',
        }),
      ]);

      const { messages: out } = await service.getMessagesForChat(
        'co-1',
        'user-a',
        'chat-a',
      );

      expect(out[0].status).toBe('failed');
      expect(out[0].statusAt).toBe(
        Math.floor(Date.parse('2026-08-21T10:00:00.000Z') / 1000),
      );
      expect(out[0].errorCode).toBe('131047');
    });

    it('reports an inbound row with a null status rather than inventing one', async () => {
      selectBuilder.getMany.mockResolvedValue([makeRow({ fromMe: false })]);

      const { messages: out } = await service.getMessagesForChat(
        'co-1',
        'user-a',
        'chat-a',
      );

      expect(out[0].status).toBeNull();
      expect(out[0].statusAt).toBeNull();
      expect(out[0].errorCode).toBeNull();
    });

    it('carries editedAt and deletedAt so the client can mark the bubble', async () => {
      selectBuilder.getMany.mockResolvedValue([
        makeRow({
          editedAt: new Date('2026-08-21T11:00:00.000Z'),
          deletedAt: new Date('2026-08-21T12:00:00.000Z'),
        }),
      ]);

      const { messages: out } = await service.getMessagesForChat(
        'co-1',
        'user-a',
        'chat-a',
      );

      expect(out[0].editedAt).toBe(
        Math.floor(Date.parse('2026-08-21T11:00:00.000Z') / 1000),
      );
      expect(out[0].deletedAt).toBe(
        Math.floor(Date.parse('2026-08-21T12:00:00.000Z') / 1000),
      );
    });

    it('still returns a deleted message: the client renders a stub, it is not hidden here', async () => {
      selectBuilder.getMany.mockResolvedValue([
        makeRow({ waMessageId: 'gone', deletedAt: new Date() }),
        makeRow({ waMessageId: 'kept', timestamp: '1700000001' }),
      ]);

      const { messages: out } = await service.getMessagesForChat(
        'co-1',
        'user-a',
        'chat-a',
      );

      expect(out.map((m) => m.id)).toEqual(['kept', 'gone']);
    });
  });

  describe('getChatHistory', () => {
    it('excludes the ids of the turn being processed', async () => {
      await service.getChatHistory('co-1', 'user-a', 'chat-a', 20, [
        'm1',
        'm2',
      ]);

      expect(selectBuilder.andWhere).toHaveBeenCalledWith(
        'm.wa_message_id NOT IN (:...excludeWaIds)',
        { excludeWaIds: ['m1', 'm2'] },
      );
    });

    it('does not add the exclusion clause when nothing is pending', async () => {
      await service.getChatHistory('co-1', 'user-a', 'chat-a', 20, []);

      const clauses = selectBuilder.andWhere.mock.calls.map(
        (c: any[]) => c[0] as string,
      );
      expect(clauses.some((c) => c.includes('NOT IN'))).toBe(false);
    });

    it('skips empty bodies and honours the limit', async () => {
      await service.getChatHistory('co-1', 'user-a', 'chat-a', 7);

      const clauses = selectBuilder.andWhere.mock.calls.map(
        (c: any[]) => c[0] as string,
      );
      expect(clauses).toContain("m.body <> ''");
      expect(selectBuilder.take).toHaveBeenCalledWith(7);
    });

    it('returns rows oldest-first', async () => {
      selectBuilder.getMany.mockResolvedValue([
        makeRow({ waMessageId: 'newer', timestamp: '200' }),
        makeRow({ waMessageId: 'older', timestamp: '100' }),
      ]);

      const out = await service.getChatHistory('co-1', 'user-a', 'chat-a', 20);

      expect(out.map((m) => m.id)).toEqual(['older', 'newer']);
    });
  });
});
