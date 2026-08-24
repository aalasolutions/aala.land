// backend/src/modules/whatsapp/message-store.service.spec.ts
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
      query: jest.fn().mockResolvedValue(undefined),
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
      ).resolves.toBe(true);
    });

    it('reports a redelivery as not inserted so the caller can skip it', async () => {
      insertBuilder.execute.mockResolvedValue({ raw: [] });

      await expect(
        service.addMessage('co-1', 'user-a', makeMsg()),
      ).resolves.toBe(false);
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
      expect(messagesRepo.find.mock.calls[0][0].where).toEqual({
        companyId: 'co-1',
        userId: 'user-a',
        chatId: 'chat-a',
      });
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
      expect(opts.take).toBe(501);
      expect(opts.skip).toBe(1000);
    });

    it('getAllMessages floors a page below 1 rather than passing a negative offset', async () => {
      await service.getAllMessages('co-1', 'user-a', 0, 50);

      expect(messagesRepo.find.mock.calls[0][0].skip).toBe(0);
    });

    it('returns messages oldest-first and maps the bigint timestamp to a number', async () => {
      messagesRepo.find.mockResolvedValue([
        makeRow({ waMessageId: 'newer', timestamp: '200' }),
        makeRow({ waMessageId: 'older', timestamp: '100' }),
      ]);

      const out = await service.getMessagesForChat('co-1', 'user-a', 'chat-a');

      expect(out.map((m) => m.id)).toEqual(['older', 'newer']);
      expect(out[0].timestamp).toBe(100);
      expect(typeof out[0].timestamp).toBe('number');
    });

    it('surfaces the original agent on a row that has been moved to someone else', async () => {
      messagesRepo.find.mockResolvedValue([
        makeRow({ userId: 'user-b', originUserId: 'user-a' }),
      ]);

      const out = await service.getMessagesForChat('co-1', 'user-b', 'chat-a');

      expect(out[0].originUserId).toBe('user-a');
    });

    it('falls back to the holder when a row predates origin tracking', async () => {
      messagesRepo.find.mockResolvedValue([
        makeRow({ userId: 'user-b', originUserId: null }),
      ]);

      const out = await service.getMessagesForChat('co-1', 'user-b', 'chat-a');

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

    it('carries the delivery status, its timestamp and the error code onto the payload', async () => {
      messagesRepo.find.mockResolvedValue([
        makeRow({
          fromMe: true,
          status: WhatsappMessageStatus.FAILED,
          statusAt: new Date('2026-08-21T10:00:00.000Z'),
          errorCode: '131047',
        }),
      ]);

      const out = await service.getMessagesForChat('co-1', 'user-a', 'chat-a');

      expect(out[0].status).toBe('failed');
      expect(out[0].statusAt).toBe(
        Math.floor(Date.parse('2026-08-21T10:00:00.000Z') / 1000),
      );
      expect(out[0].errorCode).toBe('131047');
    });

    it('reports an inbound row with a null status rather than inventing one', async () => {
      messagesRepo.find.mockResolvedValue([makeRow({ fromMe: false })]);

      const out = await service.getMessagesForChat('co-1', 'user-a', 'chat-a');

      expect(out[0].status).toBeNull();
      expect(out[0].statusAt).toBeNull();
      expect(out[0].errorCode).toBeNull();
    });

    it('carries editedAt and deletedAt so the client can mark the bubble', async () => {
      messagesRepo.find.mockResolvedValue([
        makeRow({
          editedAt: new Date('2026-08-21T11:00:00.000Z'),
          deletedAt: new Date('2026-08-21T12:00:00.000Z'),
        }),
      ]);

      const out = await service.getMessagesForChat('co-1', 'user-a', 'chat-a');

      expect(out[0].editedAt).toBe(
        Math.floor(Date.parse('2026-08-21T11:00:00.000Z') / 1000),
      );
      expect(out[0].deletedAt).toBe(
        Math.floor(Date.parse('2026-08-21T12:00:00.000Z') / 1000),
      );
    });

    it('still returns a deleted message: the client renders a stub, it is not hidden here', async () => {
      messagesRepo.find.mockResolvedValue([
        makeRow({ waMessageId: 'gone', deletedAt: new Date() }),
        makeRow({ waMessageId: 'kept', timestamp: '1700000001' }),
      ]);

      const out = await service.getMessagesForChat('co-1', 'user-a', 'chat-a');

      expect(out.map((m) => m.id)).toEqual(['kept', 'gone']);
      // No deletedAt predicate is sent to the database either.
      expect(messagesRepo.find.mock.calls[0][0].where).toEqual({
        companyId: 'co-1',
        userId: 'user-a',
        chatId: 'chat-a',
      });
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
