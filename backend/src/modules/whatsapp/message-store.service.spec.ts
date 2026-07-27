// backend/src/modules/whatsapp/message-store.service.spec.ts
import { MessageStoreService } from './message-store.service';
import { WaMessage } from './wa-types';
import { WhatsappMessage } from './entities/whatsapp-message.entity';

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
  let txManager: any;
  let messagesRepo: any;
  let chatsRepo: any;

  beforeEach(() => {
    insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
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
  });

  describe('findOwnersNeedingRecovery', () => {
    it('claims owners who are deleted or deactivated', async () => {
      await service.findOwnersNeedingRecovery();

      const sql = chatsRepo.query.mock.calls[0][0] as string;
      expect(sql).toContain('u."id" IS NULL OR u."is_active" = false');
    });

    it('reads whatsapp_chats, never the unbounded whatsapp_messages', async () => {
      await service.findOwnersNeedingRecovery();

      const sql = chatsRepo.query.mock.calls[0][0] as string;
      expect(sql).toContain('whatsapp_chats');
      expect(sql).not.toContain('whatsapp_messages');
    });

    it('maps the snake_case columns to the caller shape', async () => {
      chatsRepo.query.mockResolvedValue([
        { company_id: 'co-1', user_id: 'user-a' },
      ]);

      const out = await service.findOwnersNeedingRecovery();

      expect(out).toEqual([{ companyId: 'co-1', userId: 'user-a' }]);
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
