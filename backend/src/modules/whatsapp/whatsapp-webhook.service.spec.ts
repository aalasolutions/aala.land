import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { createHmac } from 'node:crypto';
import { IsNull, LessThanOrEqual, Or } from 'typeorm';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
  WhatsappHistorySyncStatus,
} from './entities/whatsapp-connection.entity';
import { WhatsappMessageStatus } from './entities/whatsapp-message.entity';
import { WhatsappAiService } from './whatsapp-ai.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { RedisService } from '@modules/redis/redis.service';
import { WhatsappMediaService } from './whatsapp-media.service';
import {
  WA_MEDIA_QUEUE,
  WA_WEBHOOK_EVENTS_QUEUE,
  WaMediaStatus,
  WaMessage,
} from './wa-types';

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

function signed(body: unknown): { rawBody: Buffer; signature: string } {
  const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
  const signature =
    'sha256=' +
    createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
  return { rawBody, signature };
}

function connectionRow(): WhatsappConnection {
  const row = new WhatsappConnection();
  row.id = 'conn-1';
  row.companyId = 'company-1';
  row.userId = 'user-1';
  row.phoneNumberId = 'phone-1';
  row.wabaId = 'waba-1';
  row.status = WhatsappConnectionStatus.CONNECTED;
  row.historySyncRequestedAt = new Date();
  return row;
}

function accountUpdateEnvelope(value: unknown, wabaId = 'waba-1'): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: wabaId, changes: [{ field: 'account_update', value }] }],
  };
}

function inboundEnvelope(): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'phone-1' },
              contacts: [
                { profile: { name: 'Zainab' }, wa_id: '971501234567' },
              ],
              messages: [
                {
                  from: '971501234567',
                  id: 'wamid.1',
                  timestamp: '1761234567',
                  type: 'text',
                  text: { body: 'hello, is the unit still available?' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function coexistenceEnvelope(field: string, value: unknown): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field,
            value: {
              metadata: { phone_number_id: 'phone-1' },
              ...(value as object),
            },
          },
        ],
      },
    ],
  };
}

function statusEnvelope(statuses?: unknown[]): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'phone-1' },
              statuses: statuses ?? [
                {
                  id: 'wamid.out.1',
                  status: 'delivered',
                  timestamp: '1761234567',
                  recipient_id: '971501234567',
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

const UNREAD = {
  chatId: '971501234567',
  unreadCount: 1,
  lastReadMessageId: null,
};
const stored = (inserted: boolean) => ({ inserted, unread: UNREAD });

describe('WhatsappWebhookService', () => {
  let service: WhatsappWebhookService;
  let ai: { handleIncomingMessage: jest.Mock; recordHumanReply: jest.Mock };
  let repo: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let store: {
    addMessage: jest.Mock;
    addHistoryMessages: jest.Mock;
    applyMessageStatus: jest.Mock;
    applyEdit: jest.Mock;
    markDeleted: jest.Mock;
    hasMessage: jest.Mock;
    getMessage: jest.Mock;
    findPendingMediaUuids: jest.Mock;
  };
  let gateway: {
    emitMessage: jest.Mock;
    emitMessageUpdate: jest.Mock;
    emitStatus: jest.Mock;
    emitUnread: jest.Mock;
    emitHistory: jest.Mock;
    emitConnection: jest.Mock;
  };
  let queue: { add: jest.Mock };
  let mediaQueue: { add: jest.Mock; addBulk: jest.Mock };
  let media: { deleteStoredMedia: jest.Mock; resumePendingMedia: jest.Mock };
  let redisStore: Map<string, unknown>;
  let redis: { getJson: jest.Mock; setJson: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
    ai = {
      handleIncomingMessage: jest.fn().mockResolvedValue(undefined),
      recordHumanReply: jest.fn().mockResolvedValue(undefined),
    };
    repo = {
      findOne: jest.fn().mockResolvedValue(connectionRow()),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    store = {
      addMessage: jest.fn().mockResolvedValue(stored(true)),
      addHistoryMessages: jest.fn(
        (_c: string, _u: string, _p: string, items: { msg: WaMessage }[]) =>
          Promise.resolve(items.map((item) => item.msg.id)),
      ),
      applyMessageStatus: jest.fn().mockResolvedValue(true),
      applyEdit: jest.fn().mockResolvedValue(true),
      markDeleted: jest.fn().mockResolvedValue(true),
      hasMessage: jest.fn().mockResolvedValue(true),
      getMessage: jest.fn().mockResolvedValue(null),
      findPendingMediaUuids: jest.fn().mockResolvedValue([]),
    };
    gateway = {
      emitMessage: jest.fn(),
      emitMessageUpdate: jest.fn(),
      emitStatus: jest.fn(),
      emitUnread: jest.fn(),
      emitHistory: jest.fn(),
      emitConnection: jest.fn(),
    };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    mediaQueue = {
      add: jest.fn().mockResolvedValue({ id: 'media-job-1' }),
      addBulk: jest.fn().mockResolvedValue([]),
    };
    media = {
      deleteStoredMedia: jest.fn().mockResolvedValue(undefined),
      resumePendingMedia: jest.fn().mockResolvedValue(undefined),
    };
    redisStore = new Map();
    redis = {
      getJson: jest.fn((key: string) =>
        Promise.resolve(redisStore.get(key) ?? null),
      ),
      setJson: jest.fn((key: string, value: unknown) => {
        redisStore.set(key, value);
        return Promise.resolve();
      }),
      del: jest.fn((key: string) => {
        redisStore.delete(key);
        return Promise.resolve();
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappWebhookService,
        { provide: getRepositoryToken(WhatsappConnection), useValue: repo },
        { provide: MessageStoreService, useValue: store },
        { provide: WhatsappGateway, useValue: gateway },
        { provide: WhatsappAiService, useValue: ai },
        { provide: RedisService, useValue: redis },
        { provide: getQueueToken(WA_WEBHOOK_EVENTS_QUEUE), useValue: queue },
        { provide: getQueueToken(WA_MEDIA_QUEUE), useValue: mediaQueue },
        { provide: WhatsappMediaService, useValue: media },
      ],
    }).compile();

    service = moduleRef.get(WhatsappWebhookService);
  });

  afterEach(() => {
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
  });

  describe('verifyWebhook', () => {
    it('echoes the challenge when mode and token match', () => {
      expect(
        service.verifyWebhook({
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'challenge-123',
        }),
      ).toBe('challenge-123');
    });

    it('refuses a wrong token', () => {
      expect(() =>
        service.verifyWebhook({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'nope',
          'hub.challenge': 'challenge-123',
        }),
      ).toThrow(ForbiddenException);
    });

    it('refuses a wrong mode', () => {
      expect(() =>
        service.verifyWebhook({
          'hub.mode': 'other',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'challenge-123',
        }),
      ).toThrow(ForbiddenException);
    });

    it('fails closed when no verify token is configured', () => {
      delete process.env.WHATSAPP_VERIFY_TOKEN;
      expect(() =>
        service.verifyWebhook({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'anything',
          'hub.challenge': 'challenge-123',
        }),
      ).toThrow(ForbiddenException);
    });

    it('still verifies when the env value carries surrounding whitespace', () => {
      process.env.WHATSAPP_VERIFY_TOKEN = `  ${VERIFY_TOKEN}\n`;
      expect(
        service.verifyWebhook({
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'challenge-123',
        }),
      ).toBe('challenge-123');
    });
  });

  describe('handleWebhook', () => {
    it('enqueues the parsed envelope and acks', async () => {
      const envelope = inboundEnvelope();
      const { rawBody, signature } = signed(envelope);

      await expect(
        service.handleWebhook(rawBody, signature),
      ).resolves.toEqual({ received: true });

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [name, data] = queue.add.mock.calls[0];
      expect(name).toBe('envelope');
      expect(data).toEqual({ envelope });
    });

    it('does no processing work inline', async () => {
      const { rawBody, signature } = signed(inboundEnvelope());

      await service.handleWebhook(rawBody, signature);

      expect(repo.findOne).not.toHaveBeenCalled();
      expect(store.addMessage).not.toHaveBeenCalled();
      expect(gateway.emitMessage).not.toHaveBeenCalled();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('rejects a signature computed with the wrong secret', async () => {
      const rawBody = Buffer.from(JSON.stringify(inboundEnvelope()), 'utf8');
      const signature =
        'sha256=' +
        createHmac('sha256', 'other-secret').update(rawBody).digest('hex');

      await expect(
        service.handleWebhook(rawBody, signature),
      ).rejects.toThrow(ForbiddenException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('rejects a missing signature header', async () => {
      const { rawBody } = signed(inboundEnvelope());
      await expect(service.handleWebhook(rawBody, undefined)).rejects.toThrow(
        ForbiddenException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('fails closed when no app secret is configured', async () => {
      delete process.env.WHATSAPP_APP_SECRET;
      const { rawBody, signature } = signed(inboundEnvelope());
      await expect(
        service.handleWebhook(rawBody, signature),
      ).rejects.toThrow(ForbiddenException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('fails closed when the app secret is whitespace only', async () => {
      process.env.WHATSAPP_APP_SECRET = '   ';
      const { rawBody, signature } = signed(inboundEnvelope());
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        ForbiddenException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('still validates a correctly signed payload when the env secret carries a trailing newline', async () => {
      process.env.WHATSAPP_APP_SECRET = `${APP_SECRET}\n`;
      const envelope = inboundEnvelope();
      const { rawBody, signature } = signed(envelope);

      await expect(
        service.handleWebhook(rawBody, signature),
      ).resolves.toEqual({ received: true });
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty body', async () => {
      await expect(
        service.handleWebhook(undefined, 'sha256=00'),
      ).rejects.toThrow(BadRequestException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('rejects a validly signed body that is not JSON', async () => {
      const rawBody = Buffer.from('not-json', 'utf8');
      const signature =
        'sha256=' +
        createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        BadRequestException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    // The one 5xx left on this route: Meta retries the envelope, which is the recovery.
    it('fails the request when the queue is unreachable', async () => {
      queue.add.mockRejectedValue(new Error('redis down'));
      const { rawBody, signature } = signed(inboundEnvelope());
      jest
        .spyOn((service as unknown as { logger: { error: jest.Mock } }).logger, 'error')
        .mockImplementation(() => undefined);

      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('processEnvelope', () => {
    it('dispatches an inbound text message to the AI service', async () => {
      await service.processEnvelope(inboundEnvelope());

      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
      const [evt, companyId, userId] = ai.handleIncomingMessage.mock.calls[0];
      expect(companyId).toBe('company-1');
      expect(userId).toBe('user-1');
      expect(evt.id).toBe('wamid.1');
      expect(evt.chatId).toBe('971501234567');
      expect(evt.senderName).toBe('Zainab');
      expect(evt.body).toBe('hello, is the unit still available?');
      expect(evt.fromMe).toBe(false);
      expect(evt.timestamp).toBe(1761234567);
      expect(store.addMessage).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        expect.objectContaining({ id: 'wamid.1' }),
        'phone-1',
      );
      expect(gateway.emitMessage).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ id: 'wamid.1' }),
      );
      expect(store.addMessage.mock.invocationCallOrder[0]).toBeLessThan(
        gateway.emitMessage.mock.invocationCallOrder[0],
      );
      expect(gateway.emitMessage.mock.invocationCallOrder[0]).toBeLessThan(
        ai.handleIncomingMessage.mock.invocationCallOrder[0],
      );
    });

    it('emits whatsapp:unread with the stored unread state after a first delivery', async () => {
      await service.processEnvelope(inboundEnvelope());

      expect(gateway.emitUnread).toHaveBeenCalledWith('user-1', UNREAD);
      expect(store.addMessage.mock.invocationCallOrder[0]).toBeLessThan(
        gateway.emitUnread.mock.invocationCallOrder[0],
      );
    });

    it('does not throw when the unread push throws', async () => {
      gateway.emitUnread.mockImplementation(() => {
        throw new Error('socket gone');
      });

      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).resolves.toBeUndefined();
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
    });

    it('rejects and does not emit or dispatch when persistence fails', async () => {
      store.addMessage.mockRejectedValue(new Error('db down'));

      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).rejects.toThrow('db down');
      expect(gateway.emitMessage).not.toHaveBeenCalled();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('skips envelopes for an unknown or disconnected number', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).resolves.toBeUndefined();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('skips non-text and empty-body messages', async () => {
      const envelope = inboundEnvelope() as {
        entry: { changes: { value: { messages: unknown[] } }[] }[];
      };
      envelope.entry[0].changes[0].value.messages = [
        { from: '971501234567', id: 'wamid.img', timestamp: '1', type: 'image' },
        {
          from: '971501234567',
          id: 'wamid.empty',
          timestamp: '1',
          type: 'text',
          text: { body: '   ' },
        },
      ];

      await expect(service.processEnvelope(envelope)).resolves.toBeUndefined();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('handles a statuses-only payload without dispatching to the AI', async () => {
      await expect(
        service.processEnvelope(statusEnvelope()),
      ).resolves.toBeUndefined();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
      expect(gateway.emitMessage).not.toHaveBeenCalled();
    });

    it('still persists and dispatches the messages when status persistence fails in the same value', async () => {
      store.applyMessageStatus.mockRejectedValue(new Error('status db down'));
      const envelope = inboundEnvelope() as {
        entry: { changes: { value: { statuses?: unknown[] } }[] }[];
      };
      envelope.entry[0].changes[0].value.statuses = [
        { id: 'wamid.out.1', status: 'delivered', timestamp: '1761234567' },
      ];

      await expect(service.processEnvelope(envelope)).rejects.toThrow(
        'status db down',
      );
      expect(store.addMessage).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        expect.objectContaining({ id: 'wamid.1' }),
        'phone-1',
      );
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
    });
  });

  // Once disconnected, nothing an agent's number receives may reach the AI; a turn spends a credit.
  describe('a disconnected agent cannot start an AI turn', () => {
    beforeEach(() => {
      // Behaves like the real lookup: the row is only returned for a status it asks for.
      const row = connectionRow();
      row.status = WhatsappConnectionStatus.DISCONNECTED;
      row.disconnectedAt = new Date();
      repo.findOne.mockImplementation(
        async (options: {
          where: { phoneNumberId: string; status: WhatsappConnectionStatus }[];
        }) =>
          options.where.some(
            (w) =>
              w.phoneNumberId === row.phoneNumberId && w.status === row.status,
          )
            ? row
            : null,
      );
    });

    it('never dispatches, persists, or pushes the inbound message', async () => {
      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).resolves.toBeUndefined();

      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
      expect(store.addMessage).not.toHaveBeenCalled();
      expect(gateway.emitMessage).not.toHaveBeenCalled();
    });

    it('asks only for CONNECTED and FLAGGED, which is what excludes the row', async () => {
      await service.processEnvelope(inboundEnvelope());

      expect(repo.findOne).toHaveBeenCalledWith({
        where: [
          {
            phoneNumberId: 'phone-1',
            status: WhatsappConnectionStatus.CONNECTED,
          },
          {
            phoneNumberId: 'phone-1',
            status: WhatsappConnectionStatus.FLAGGED,
          },
        ],
      });
    });

    it('drops the delivery statuses of that number too', async () => {
      await expect(
        service.processEnvelope(statusEnvelope()),
      ).resolves.toBeUndefined();

      expect(store.applyMessageStatus).not.toHaveBeenCalled();
    });
  });

  // Inbound is kept and shown; only the AI turn is held back, its reply could not send.
  describe('a flagged connection still receives inbound traffic', () => {
    beforeEach(() => {
      const row = connectionRow();
      row.status = WhatsappConnectionStatus.FLAGGED;
      repo.findOne.mockResolvedValue(row);
    });

    it('persists the message and pushes it to the operator page', async () => {
      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).resolves.toBeUndefined();

      expect(store.addMessage).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        expect.objectContaining({ id: 'wamid.1' }),
        'phone-1',
      );
      expect(gateway.emitMessage).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ id: 'wamid.1' }),
      );
    });

    it('does not start an AI turn, whose reply could not be sent anyway', async () => {
      await service.processEnvelope(inboundEnvelope());

      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('still persists the delivery statuses of that number', async () => {
      await service.processEnvelope(statusEnvelope());

      expect(store.applyMessageStatus).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.out.1',
        WhatsappMessageStatus.DELIVERED,
        new Date(1761234567 * 1000),
        null,
      );
    });
  });

  describe('redelivery', () => {
    it('does not emit or dispatch a message the store already held', async () => {
      store.addMessage.mockResolvedValue(stored(false));

      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).resolves.toBeUndefined();
      expect(store.addMessage).toHaveBeenCalledTimes(1);
      expect(gateway.emitMessage).not.toHaveBeenCalled();
      expect(gateway.emitUnread).not.toHaveBeenCalled();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('still dispatches a message the store has not seen', async () => {
      store.addMessage.mockResolvedValue(stored(true));

      await service.processEnvelope(inboundEnvelope());
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
    });

    // A BullMQ retry replays the whole envelope; the wamid dedupe is what makes that safe.
    it('dispatches once when the same envelope is processed twice', async () => {
      store.addMessage
        .mockResolvedValueOnce(stored(true))
        .mockResolvedValueOnce(stored(false));
      const envelope = inboundEnvelope();

      await service.processEnvelope(envelope);
      await service.processEnvelope(envelope);

      expect(store.addMessage).toHaveBeenCalledTimes(2);
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
    });

    it('re-dispatches a stored message to the AI on a BullMQ retry attempt, without a second live push', async () => {
      store.addMessage.mockResolvedValue(stored(false));

      await expect(
        service.processEnvelope(inboundEnvelope(), true),
      ).resolves.toBeUndefined();
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
      expect(ai.handleIncomingMessage.mock.calls[0][0].id).toBe('wamid.1');
      expect(gateway.emitMessage).not.toHaveBeenCalled();
    });

    it('still skips a stored message on a retry when the connection is not CONNECTED', async () => {
      store.addMessage.mockResolvedValue(stored(false));
      repo.findOne.mockResolvedValue(
        Object.assign(connectionRow(), {
          status: WhatsappConnectionStatus.FLAGGED,
        }),
      );

      await service.processEnvelope(inboundEnvelope(), true);
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('recovers a failed AI hand-off: first run rejects, the retry dispatches again', async () => {
      jest
        .spyOn(
          (service as unknown as { logger: { error: jest.Mock } }).logger,
          'error',
        )
        .mockImplementation(() => undefined);
      store.addMessage
        .mockResolvedValueOnce(stored(true))
        .mockResolvedValueOnce(stored(false));
      ai.handleIncomingMessage
        .mockRejectedValueOnce(new Error('redis blip'))
        .mockResolvedValueOnce(undefined);
      const envelope = inboundEnvelope();

      await expect(service.processEnvelope(envelope)).rejects.toThrow(
        'redis blip',
      );
      await expect(
        service.processEnvelope(envelope, true),
      ).resolves.toBeUndefined();
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('per-message failures', () => {
    it('rejects when the AI dispatch throws, so BullMQ retries the envelope', async () => {
      ai.handleIncomingMessage.mockRejectedValue(new Error('llm down'));

      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).rejects.toThrow('llm down');
    });

    it('does not throw when the live push throws, and still runs the unread push and the AI hand-off', async () => {
      gateway.emitMessage.mockImplementation(() => {
        throw new Error('socket gone');
      });

      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).resolves.toBeUndefined();
      expect(gateway.emitUnread).toHaveBeenCalledWith('user-1', UNREAD);
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
    });

    it('processes the rest of the batch after an AI hand-off fails, then rejects', async () => {
      const envelope = inboundEnvelope() as {
        entry: { changes: { value: { messages: unknown[] } }[] }[];
      };
      envelope.entry[0].changes[0].value.messages = [
        {
          from: '971501234567',
          id: 'wamid.bad',
          timestamp: '1761234567',
          type: 'text',
          text: { body: 'first' },
        },
        {
          from: '971501234567',
          id: 'wamid.good',
          timestamp: '1761234568',
          type: 'text',
          text: { body: 'second' },
        },
      ];
      ai.handleIncomingMessage.mockRejectedValueOnce(new Error('llm down'));

      await expect(service.processEnvelope(envelope)).rejects.toThrow(
        'llm down',
      );
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(2);
      expect(ai.handleIncomingMessage.mock.calls[1][0].id).toBe('wamid.good');
    });
  });

  // The queue runs attempts: 3, which is dead unless a change-level failure escapes.
  describe('a change-level failure hands the envelope back to BullMQ', () => {
    beforeEach(() => {
      jest
        .spyOn(
          (service as unknown as { logger: { error: jest.Mock } }).logger,
          'error',
        )
        .mockImplementation(() => undefined);
    });

    const twoChangeEnvelope = () => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: ['first', 'second'].map((label) => ({
            field: 'messages',
            value: {
              metadata: { phone_number_id: 'phone-1' },
              messages: [
                {
                  from: '971501234567',
                  id: `wamid.${label}`,
                  timestamp: '1761234567',
                  type: 'text',
                  text: { body: label },
                },
              ],
            },
          })),
        },
      ],
    });

    it('processes the sibling change and then rejects', async () => {
      repo.findOne
        .mockRejectedValueOnce(new Error('db pool exhausted'))
        .mockResolvedValue(connectionRow());

      await expect(
        service.processEnvelope(twoChangeEnvelope()),
      ).rejects.toThrow('db pool exhausted');

      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
      expect(ai.handleIncomingMessage.mock.calls[0][0].id).toBe('wamid.second');
    });

    it('reports the first failure when several changes fail', async () => {
      repo.findOne
        .mockRejectedValueOnce(new Error('first failure'))
        .mockRejectedValueOnce(new Error('second failure'));

      await expect(
        service.processEnvelope(twoChangeEnvelope()),
      ).rejects.toThrow('first failure');
    });

    // The pool is down for seconds and the retry lands after it heals.
    it('loses nothing across the retry: the second run delivers the message', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('db pool exhausted'));
      const envelope = inboundEnvelope();

      await expect(service.processEnvelope(envelope)).rejects.toThrow(
        'db pool exhausted',
      );
      expect(store.addMessage).not.toHaveBeenCalled();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();

      await expect(service.processEnvelope(envelope)).resolves.toBeUndefined();
      expect(store.addMessage).toHaveBeenCalledTimes(1);
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
      expect(ai.handleIncomingMessage.mock.calls[0][0].id).toBe('wamid.1');
    });

    it('rejects when a statuses-only change fails to route', async () => {
      repo.findOne.mockRejectedValue(new Error('db down'));

      await expect(service.processEnvelope(statusEnvelope())).rejects.toThrow(
        'db down',
      );
    });
  });

  describe('timestamp hardening', () => {
    const withTimestamp = (timestamp: unknown) => {
      const envelope = inboundEnvelope() as {
        entry: {
          changes: { value: { messages: Record<string, unknown>[] } }[];
        }[];
      };
      const message = envelope.entry[0].changes[0].value.messages[0];
      if (timestamp === undefined) delete message.timestamp;
      else message.timestamp = timestamp;
      return envelope;
    };

    it.each([
      ['missing', undefined],
      ['non-numeric', 'not-a-number'],
      ['whitespace', '   '],
      ['zero', '0'],
    ])('skips a message with a %s timestamp', async (_label, timestamp) => {
      await expect(
        service.processEnvelope(withTimestamp(timestamp)),
      ).resolves.toBeUndefined();
      expect(store.addMessage).not.toHaveBeenCalled();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });
  });

  describe('status callbacks', () => {
    it('persists a delivered status against the routed connection', async () => {
      await service.processEnvelope(statusEnvelope());

      expect(store.applyMessageStatus).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.out.1',
        WhatsappMessageStatus.DELIVERED,
        new Date(1761234567 * 1000),
        null,
      );
    });

    it('carries the first error code on a failed status', async () => {
      await service.processEnvelope(
        statusEnvelope([
          {
            id: 'wamid.out.1',
            status: 'failed',
            timestamp: '1761234567',
            errors: [{ code: 131042 }, { code: 999 }],
          },
        ]),
      );

      expect(store.applyMessageStatus).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.out.1',
        WhatsappMessageStatus.FAILED,
        expect.any(Date),
        '131042',
      );
    });

    it('passes every status Meta sends straight through', async () => {
      await service.processEnvelope(
        statusEnvelope(
          ['sent', 'delivered', 'read', 'played', 'failed'].map((status, i) => ({
            id: `wamid.out.${i}`,
            status,
            timestamp: '1761234567',
          })),
        ),
      );

      expect(store.applyMessageStatus).toHaveBeenCalledTimes(5);
      expect(
        store.applyMessageStatus.mock.calls.map((c) => c[3] as string),
      ).toEqual(['sent', 'delivered', 'read', 'played', 'failed']);
    });

    it('skips a status Meta does not define and one with no wamid', async () => {
      await expect(
        service.processEnvelope(
          statusEnvelope([
            { id: 'wamid.out.1', status: 'invented', timestamp: '1' },
            { status: 'read', timestamp: '1' },
          ]),
        ),
      ).resolves.toBeUndefined();
      expect(store.applyMessageStatus).not.toHaveBeenCalled();
    });

    it('moves on when the wamid is unknown to us', async () => {
      store.applyMessageStatus.mockResolvedValue(false);

      await expect(
        service.processEnvelope(statusEnvelope()),
      ).resolves.toBeUndefined();
    });

    it('pushes an applied status to the agent in epoch seconds', async () => {
      await service.processEnvelope(
        statusEnvelope([
          {
            id: 'wamid.out.1',
            status: 'failed',
            timestamp: '1761234567',
            errors: [{ code: 131042 }],
          },
        ]),
      );

      expect(gateway.emitStatus).toHaveBeenCalledWith('user-1', {
        id: 'wamid.out.1',
        status: WhatsappMessageStatus.FAILED,
        statusAt: 1761234567,
        errorCode: '131042',
      });
    });

    it('does not push a status that was not applied', async () => {
      store.applyMessageStatus.mockResolvedValue(false);

      await service.processEnvelope(statusEnvelope());

      expect(gateway.emitStatus).not.toHaveBeenCalled();
    });

    it('does not reject when the status push throws', async () => {
      gateway.emitStatus.mockImplementation(() => {
        throw new Error('socket down');
      });

      await expect(
        service.processEnvelope(statusEnvelope()),
      ).resolves.toBeUndefined();
      expect(store.applyMessageStatus).toHaveBeenCalledTimes(1);
    });

    it('rejects when the status write throws, so BullMQ retries the envelope', async () => {
      store.applyMessageStatus.mockRejectedValue(new Error('db down'));

      await expect(
        service.processEnvelope(statusEnvelope()),
      ).rejects.toThrow('db down');
    });

    it('drops statuses for an unknown or disconnected number', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.processEnvelope(statusEnvelope()),
      ).resolves.toBeUndefined();
      expect(store.applyMessageStatus).not.toHaveBeenCalled();
    });

    it('falls back to now when the status carries no usable timestamp', async () => {
      await service.processEnvelope(
        statusEnvelope([{ id: 'wamid.out.1', status: 'read' }]),
      );

      expect(store.applyMessageStatus.mock.calls[0][4]).toBeInstanceOf(Date);
    });
  });

  // phone_number_id is supplied by the browser at signup, so it is a claim, not proof.
  describe('WABA cross-check on inbound', () => {
    it('refuses a message whose WABA does not match the stored connection', async () => {
      repo.findOne.mockResolvedValue(
        Object.assign(connectionRow(), { wabaId: 'waba-OTHER' }),
      );

      await service.processEnvelope(inboundEnvelope());

      expect(store.addMessage).not.toHaveBeenCalled();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('accepts a message whose WABA matches', async () => {
      await service.processEnvelope(inboundEnvelope());

      expect(store.addMessage).toHaveBeenCalled();
    });
  });

  // account_update carries no metadata.phone_number_id, so it is routed off waba_info.waba_id, else entry.id.
  describe('account_update', () => {
    // A real CONNECTED or FLAGGED row always holds a token; handlers refuse to promote one without.
    const rowFor = (overrides: Partial<WhatsappConnection> = {}) =>
      Object.assign(
        connectionRow(),
        { id: 'conn-1', accessTokenCiphertext: 'v1.iv.tag.ct' },
        overrides,
      );
    // The first update is the event-time claim; these are the status transitions after it.
    const statusWrites = () =>
      repo.update.mock.calls.filter((c) => 'status' in c[1]);

    it('disconnects on PARTNER_REMOVED and keeps Meta reason', async () => {
      repo.find.mockResolvedValue([rowFor()]);

      await service.processEnvelope(
        accountUpdateEnvelope({
          event: 'PARTNER_REMOVED',
          disconnection_info: { reason: 'PRIMARY_INACTIVITY', initiated_by: 'SYSTEM' },
        }),
      );

      const [where, patch] = statusWrites()[0];
      expect(where).toEqual({ id: 'conn-1', lifecycleEventAt: expect.anything() });
      expect(patch.status).toBe(WhatsappConnectionStatus.DISCONNECTED);
      expect(patch.disconnectReason).toBe('PRIMARY_INACTIVITY');
    });

    it('finds the connection by waba_info when entry.id is the partner business', async () => {
      repo.find.mockResolvedValue([rowFor()]);

      await service.processEnvelope(
        accountUpdateEnvelope(
          {
            event: 'PARTNER_REMOVED',
            waba_info: { waba_id: 'waba-1', owner_business_id: 'owner-1' },
          },
          'partner-business-1',
        ),
      );

      expect(repo.find.mock.calls[0][0].where).toMatchObject({
        wabaId: 'waba-1',
      });
      expect(statusWrites()[0][1].status).toBe(
        WhatsappConnectionStatus.DISCONNECTED,
      );
    });

    it('pushes each status change to the connection owner', async () => {
      repo.find.mockResolvedValue([rowFor()]);
      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'ACCOUNT_OFFBOARDED' }),
      );
      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_REMOVED' }),
      );

      expect(gateway.emitConnection.mock.calls).toEqual([
        ['user-1', { status: WhatsappConnectionStatus.FLAGGED }],
        ['user-1', { status: WhatsappConnectionStatus.DISCONNECTED }],
      ]);
    });

    it('pushes nothing when a stale event changes no row', async () => {
      repo.find.mockResolvedValue([rowFor()]);
      repo.update.mockResolvedValue({ affected: 0 });

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_REMOVED' }),
      );

      expect(gateway.emitConnection).not.toHaveBeenCalled();
    });

    it('falls back to the event name when no disconnection reason is sent', async () => {
      repo.find.mockResolvedValue([rowFor()]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_REMOVED' }),
      );

      expect(statusWrites()[0][1].disconnectReason).toBe('PARTNER_REMOVED');
    });

    // Meta treats a device change as self-healing, so it's a suspension; FLAGGED keeps inbound flowing.
    it('flags rather than disconnects on ACCOUNT_OFFBOARDED', async () => {
      repo.find.mockResolvedValue([rowFor()]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'ACCOUNT_OFFBOARDED' }),
      );

      expect(statusWrites()[0][1].status).toBe(
        WhatsappConnectionStatus.FLAGGED,
      );
    });

    it('restores a connection on ACCOUNT_RECONNECTED and clears the reason', async () => {
      repo.find.mockResolvedValue([
        rowFor({
          status: WhatsappConnectionStatus.FLAGGED,
          disconnectReason: 'ACCOUNT_OFFBOARDED',
        }),
      ]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'ACCOUNT_RECONNECTED' }),
      );

      const patch = statusWrites()[0][1];
      expect(patch.status).toBe(WhatsappConnectionStatus.CONNECTED);
      expect(patch.disconnectReason).toBeNull();
      expect(patch.disconnectedAt).toBeNull();
      expect(media.resumePendingMedia).toHaveBeenCalledWith(
        'company-1',
        'user-1',
      );
    });

    it('promotes a PENDING row on PARTNER_ADDED but leaves a CONNECTED one alone', async () => {
      repo.find.mockResolvedValue([
        rowFor({ status: WhatsappConnectionStatus.PENDING }),
      ]);
      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_ADDED' }),
      );
      expect(statusWrites()[0][1].status).toBe(
        WhatsappConnectionStatus.CONNECTED,
      );

      repo.update.mockClear();
      repo.find.mockResolvedValue([rowFor()]);
      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_ADDED' }),
      );
      expect(statusWrites()).toHaveLength(0);
    });

    // Guessing a status from an unknown string is how an agent silently loses a number.
    it('changes nothing on an unrecognised event', async () => {
      repo.find.mockResolvedValue([rowFor()]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'SOMETHING_META_ADDED_LATER' }),
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('changes nothing for an unknown WABA', async () => {
      repo.find.mockResolvedValue([]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_REMOVED' }),
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    // A WABA can host 20 numbers with differently formatted display numbers, so matching uses digits.
    it('picks the right number when one WABA hosts several, ignoring formatting', async () => {
      repo.find.mockResolvedValue([
        rowFor({ id: 'conn-a', displayPhoneNumber: '+971 50 000 0000' }),
        rowFor({ id: 'conn-b', displayPhoneNumber: '+971 50 111 1111' }),
      ]);

      await service.processEnvelope(
        accountUpdateEnvelope({
          event: 'PARTNER_REMOVED',
          phone_number: '+971-50-111-1111',
        }),
      );

      expect(statusWrites()[0][0]).toMatchObject({ id: 'conn-b' });
    });

    it('refuses to guess when several numbers share a WABA and none matches', async () => {
      repo.find.mockResolvedValue([
        rowFor({ id: 'conn-a', displayPhoneNumber: '+971 50 000 0000' }),
        rowFor({ id: 'conn-b', displayPhoneNumber: '+971 50 111 1111' }),
      ]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_REMOVED' }),
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    // A WABA can host multiple numbers, so matching must check phone_number, not just the WABA id.
    it('ignores an event naming a different number on the same WABA', async () => {
      repo.find.mockResolvedValue([
        rowFor({ displayPhoneNumber: '+971 50 000 0000' }),
      ]);

      await service.processEnvelope(
        accountUpdateEnvelope({
          event: 'PARTNER_REMOVED',
          phone_number: '+971 50 999 9999',
        }),
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('still applies a single-row event when the number cannot be compared', async () => {
      repo.find.mockResolvedValue([rowFor({ displayPhoneNumber: '' })]);

      await service.processEnvelope(
        accountUpdateEnvelope({
          event: 'PARTNER_REMOVED',
          phone_number: '+971 50 999 9999',
        }),
      );

      expect(statusWrites()[0][1].status).toBe(
        WhatsappConnectionStatus.DISCONNECTED,
      );
    });

    // A self-disconnected row has no token, so reconnecting it would show Connected while sends fail.
    it('refuses to reconnect a row that has no stored token', async () => {
      repo.find.mockResolvedValue([
        rowFor({
          status: WhatsappConnectionStatus.FLAGGED,
          accessTokenCiphertext: null,
        }),
      ]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'ACCOUNT_RECONNECTED' }),
      );

      expect(statusWrites()).toHaveLength(0);
    });

    // Once disconnected, only pressing Connect again brings it back, never a Meta lifecycle event.
    it('never resurrects a DISCONNECTED row on ACCOUNT_OFFBOARDED or ACCOUNT_RECONNECTED', async () => {
      repo.find.mockResolvedValue([]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'ACCOUNT_OFFBOARDED' }),
      );
      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'ACCOUNT_RECONNECTED' }),
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('acts on the live CONNECTED row when a stale DISCONNECTED row shares the same number', async () => {
      // The find query excludes DISCONNECTED rows, so the stale duplicate is invisible to the matcher.
      repo.find.mockResolvedValue([rowFor({ id: 'conn-live' })]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_REMOVED' }),
      );

      expect(statusWrites()[0][0]).toMatchObject({ id: 'conn-live' });
    });

    it('leaves a FLAGGED row unchanged on ACCOUNT_OFFBOARDED, requiring CONNECTED in the update criteria', async () => {
      repo.find.mockResolvedValue([
        rowFor({
          status: WhatsappConnectionStatus.FLAGGED,
          disconnectReason: 'token_invalid_190',
        }),
      ]);
      repo.update
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValue({ affected: 0 });

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'ACCOUNT_OFFBOARDED' }),
      );

      expect(statusWrites()[0][0]).toEqual({
        id: 'conn-1',
        status: WhatsappConnectionStatus.CONNECTED,
        lifecycleEventAt: expect.anything(),
      });
    });

    it('does not revive a row FLAGGED for another reason on ACCOUNT_RECONNECTED', async () => {
      repo.find.mockResolvedValue([
        rowFor({
          status: WhatsappConnectionStatus.FLAGGED,
          disconnectReason: 'token_invalid_190',
        }),
      ]);
      repo.update
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValue({ affected: 0 });

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'ACCOUNT_RECONNECTED' }),
      );

      expect(statusWrites()[0][0]).toEqual({
        id: 'conn-1',
        status: WhatsappConnectionStatus.FLAGGED,
        disconnectReason: 'ACCOUNT_OFFBOARDED',
        lifecycleEventAt: expect.anything(),
      });
      expect(media.resumePendingMedia).not.toHaveBeenCalled();
    });

    describe('stale lifecycle events', () => {
      const timedEnvelope = (event: string, time?: number) => ({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba-1',
            time,
            changes: [{ field: 'account_update', value: { event } }],
          },
        ],
      });

      it.each([
        ['PARTNER_REMOVED', WhatsappConnectionStatus.CONNECTED],
        ['ACCOUNT_OFFBOARDED', WhatsappConnectionStatus.CONNECTED],
        ['ACCOUNT_RECONNECTED', WhatsappConnectionStatus.FLAGGED],
        ['PARTNER_ADDED', WhatsappConnectionStatus.PENDING],
      ])(
        '%s stamps entry.time and guards the write on it',
        async (event, status) => {
          repo.find.mockResolvedValue([
            rowFor({ status, disconnectReason: 'ACCOUNT_OFFBOARDED' }),
          ]);

          await service.processEnvelope(timedEnvelope(event, 1743451903));

          const eventAt = new Date(1743451903 * 1000);
          const guard = Or(IsNull(), LessThanOrEqual(eventAt));
          expect(repo.update.mock.calls[0]).toEqual([
            { id: 'conn-1', lifecycleEventAt: guard },
            { lifecycleEventAt: eventAt },
          ]);
          const [where, patch] = statusWrites()[0];
          expect(patch.lifecycleEventAt).toEqual(eventAt);
          expect(where.lifecycleEventAt).toEqual(guard);
        },
      );

      it('falls back to now when the entry carries no time', async () => {
        repo.find.mockResolvedValue([rowFor()]);
        const before = Date.now();

        await service.processEnvelope(timedEnvelope('PARTNER_REMOVED'));

        const stamped = repo.update.mock.calls[0][1].lifecycleEventAt as Date;
        expect(stamped.getTime()).toBeGreaterThanOrEqual(before);
      });

      it('ignores and logs an event older than the last applied one', async () => {
        repo.find.mockResolvedValue([rowFor()]);
        repo.update.mockResolvedValue({ affected: 0 });
        const log = jest
          .spyOn(
            (service as unknown as { logger: { log: jest.Mock } }).logger,
            'log',
          )
          .mockImplementation(() => undefined);
        const warn = jest
          .spyOn(
            (service as unknown as { logger: { warn: jest.Mock } }).logger,
            'warn',
          )
          .mockImplementation(() => undefined);

        await expect(
          service.processEnvelope(timedEnvelope('PARTNER_REMOVED', 1)),
        ).resolves.toBeUndefined();

        expect(repo.update).toHaveBeenCalledTimes(1);
        expect(
          log.mock.calls.some((c) => String(c[0]).includes('stale')),
        ).toBe(true);
        expect(warn).not.toHaveBeenCalled();
      });

      // Evaluates update criteria against one in-memory row, like Postgres would.
      const statefulRow = (overrides: Partial<WhatsappConnection>) => {
        const row = rowFor(overrides);
        repo.find.mockImplementation(async () =>
          row.status === WhatsappConnectionStatus.DISCONNECTED ? [] : [row],
        );
        repo.update.mockImplementation(
          async (
            where: Record<string, unknown>,
            patch: Partial<WhatsappConnection>,
          ) => {
            const eventAt = patch.lifecycleEventAt as Date;
            const matches = Object.entries(where).every(([key, value]) =>
              key === 'lifecycleEventAt'
                ? !row.lifecycleEventAt ||
                  row.lifecycleEventAt.getTime() <= eventAt.getTime()
                : (row as unknown as Record<string, unknown>)[key] === value,
            );
            if (!matches) return { affected: 0 };
            Object.assign(row, patch);
            return { affected: 1 };
          },
        );
        return row;
      };
      const T1 = 1743451903;

      it('keeps the row CONNECTED when RECONNECTED(T2) is processed before OFFBOARDED(T1)', async () => {
        const row = statefulRow({ lifecycleEventAt: null });

        await service.processEnvelope(timedEnvelope('ACCOUNT_RECONNECTED', T1 + 5));
        await service.processEnvelope(timedEnvelope('ACCOUNT_OFFBOARDED', T1));

        expect(row.status).toBe(WhatsappConnectionStatus.CONNECTED);
        expect(row.lifecycleEventAt).toEqual(new Date((T1 + 5) * 1000));
      });

      it('ignores an older PARTNER_REMOVED after a no-op PARTNER_ADDED', async () => {
        const row = statefulRow({ lifecycleEventAt: null });

        await service.processEnvelope(timedEnvelope('PARTNER_ADDED', T1 + 5));
        await service.processEnvelope(timedEnvelope('PARTNER_REMOVED', T1));

        expect(row.status).toBe(WhatsappConnectionStatus.CONNECTED);
      });

      it('ignores a retried PARTNER_REMOVED after a signup reconnect, even in the same second', async () => {
        // Signup stamps a millisecond now(); Meta's entry.time is whole seconds.
        const row = statefulRow({
          lifecycleEventAt: new Date(T1 * 1000 + 500),
        });

        await service.processEnvelope(timedEnvelope('PARTNER_REMOVED', T1), true);

        expect(row.status).toBe(WhatsappConnectionStatus.CONNECTED);
      });

      it('still applies a genuine later event after a signup reconnect', async () => {
        const row = statefulRow({
          lifecycleEventAt: new Date(T1 * 1000 + 500),
        });

        await service.processEnvelope(timedEnvelope('PARTNER_REMOVED', T1 + 1));

        expect(row.status).toBe(WhatsappConnectionStatus.DISCONNECTED);
      });

      it('applies a retried event whose claim landed but whose transition write failed', async () => {
        jest
          .spyOn(
            (service as unknown as { logger: { error: jest.Mock } }).logger,
            'error',
          )
          .mockImplementation(() => undefined);
        const row = statefulRow({ lifecycleEventAt: null });
        const realUpdate = repo.update.getMockImplementation()!;
        repo.update
          .mockImplementationOnce(realUpdate)
          .mockImplementationOnce(async () => {
            throw new Error('db blip');
          });

        await expect(
          service.processEnvelope(timedEnvelope('PARTNER_REMOVED', T1)),
        ).rejects.toThrow('db blip');
        await service.processEnvelope(timedEnvelope('PARTNER_REMOVED', T1), true);

        expect(row.status).toBe(WhatsappConnectionStatus.DISCONNECTED);
      });
    });

    it('never routes an account_update down the message path', async () => {
      repo.find.mockResolvedValue([rowFor()]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_REMOVED' }),
      );

      expect(store.addMessage).not.toHaveBeenCalled();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });
  });

  describe('history', () => {
    const historyItems = (): { msg: WaMessage; status?: string }[] =>
      store.addHistoryMessages.mock.calls.flatMap((c) => c[3]);
    const historyValue = (progress: number) => ({
      history: [
        {
          metadata: { phase: 0, chunk_order: 1, progress },
          threads: [
            {
              id: '971501234567',
              messages: [
                {
                  from: '971501234567',
                  id: 'wamid.h1',
                  timestamp: '1761000000',
                  type: 'text',
                  text: { body: 'is parking included?' },
                  history_context: { status: 'READ' },
                },
                {
                  from: '15550001111',
                  to: '971501234567',
                  id: 'wamid.h2',
                  timestamp: '1761000060',
                  type: 'text',
                  text: { body: 'yes, one bay' },
                  history_context: { status: 'READ' },
                },
                {
                  from: '971501234567',
                  id: 'wamid.h3',
                  timestamp: '1761000120',
                  type: 'media_placeholder',
                },
              ],
            },
          ],
        },
      ],
    });

    it('stores every message passively, with direction from the to field', async () => {
      await service.processEnvelope(
        coexistenceEnvelope('history', historyValue(40)),
      );

      expect(store.addMessage).not.toHaveBeenCalled();
      expect(store.addHistoryMessages).toHaveBeenCalledTimes(1);
      expect(store.addHistoryMessages.mock.calls[0].slice(0, 3)).toEqual([
        'company-1',
        'user-1',
        connectionRow().phoneNumberId,
      ]);
      const msgs = historyItems().map((item) => item.msg);
      expect(msgs).toHaveLength(3);
      expect(msgs[0]).toMatchObject({
        id: 'wamid.h1',
        chatId: '971501234567',
        fromMe: false,
        body: 'is parking included?',
      });
      expect(msgs[1]).toMatchObject({ id: 'wamid.h2', fromMe: true });
      expect(msgs[2]).toMatchObject({ id: 'wamid.h3', body: '[Media]' });
    });

    it("inserts Meta's delivery state on our own history messages only", async () => {
      const ours = (id: string, status?: string) => ({
        from: '15550001111',
        id,
        timestamp: '1761000060',
        type: 'text',
        text: { body: id },
        ...(status ? { history_context: { status } } : {}),
      });
      await service.processEnvelope(
        coexistenceEnvelope('history', {
          history: [
            {
              metadata: { phase: 0, chunk_order: 1, progress: 40 },
              threads: [
                {
                  id: '971501234567',
                  messages: [
                    ours('wamid.read', 'READ'),
                    ours('wamid.error', 'ERROR'),
                    ours('wamid.pending', 'PENDING'),
                    ours('wamid.none'),
                    {
                      from: '971501234567',
                      id: 'wamid.theirs',
                      timestamp: '1761000120',
                      type: 'text',
                      text: { body: 'hi' },
                      history_context: { status: 'READ' },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );

      const options = Object.fromEntries(
        historyItems().map(({ msg, ...rest }) => [msg.id, rest]),
      );
      expect(options['wamid.read']).toEqual({
        status: 'read',
        statusAt: new Date(1761000060 * 1000),
      });
      expect(options['wamid.error'].status).toBe('failed');
      expect(options['wamid.none'].status).toBe('delivered');
      expect(options['wamid.pending']).toEqual({});
      expect(options['wamid.theirs']).toEqual({});
      expect(store.applyMessageStatus).not.toHaveBeenCalled();
    });

    it('treats a history message from the business number as ours even without a to field', async () => {
      await service.processEnvelope(
        coexistenceEnvelope('history', {
          history: [
            {
              metadata: { phase: 0, chunk_order: 1, progress: 40 },
              threads: [
                {
                  id: '971501234567',
                  messages: [
                    {
                      from: '15550001111',
                      id: 'wamid.h9',
                      timestamp: '1761000060',
                      type: 'text',
                      text: { body: 'our old reply' },
                    },
                    {
                      from: '971501234567',
                      id: 'wamid.h10',
                      timestamp: '1761000120',
                      type: 'text',
                      text: { body: 'their old message' },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );

      const msgs = historyItems().map((item) => item.msg);
      expect(msgs[0]).toMatchObject({ id: 'wamid.h9', fromMe: true });
      expect(msgs[1]).toMatchObject({ id: 'wamid.h10', fromMe: false });
    });

    it('never reaches the AI, unread pushes or live message pushes', async () => {
      await service.processEnvelope(
        coexistenceEnvelope('history', historyValue(40)),
      );

      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
      expect(ai.recordHumanReply).not.toHaveBeenCalled();
      expect(gateway.emitMessage).not.toHaveBeenCalled();
      expect(gateway.emitUnread).not.toHaveBeenCalled();
    });

    it('records progress forward-only and marks 100 as complete', async () => {
      await service.processEnvelope(
        coexistenceEnvelope('history', historyValue(100)),
      );

      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({ historySyncProgress: expect.anything() }),
        {
          historySyncStatus: WhatsappHistorySyncStatus.COMPLETE,
          historySyncProgress: 100,
        },
      );
      expect(gateway.emitHistory).toHaveBeenCalledWith('user-1', {
        status: WhatsappHistorySyncStatus.COMPLETE,
        progress: 100,
      });
    });

    it('does not push a progress that did not move forward', async () => {
      repo.update.mockResolvedValue({ affected: 0 });

      await service.processEnvelope(
        coexistenceEnvelope('history', historyValue(20)),
      );

      expect(gateway.emitHistory).not.toHaveBeenCalled();
    });

    it('applies an edit parked for one of our history messages', async () => {
      redisStore.set('wa:msg:pending:company-1:user-1:wamid.h2', {
        kind: 'edit',
        body: 'yes, two bays',
        at: 1761000900 * 1000,
        fromMe: true,
      });

      await service.processEnvelope(
        coexistenceEnvelope('history', historyValue(40)),
      );

      expect(store.applyEdit).toHaveBeenCalledTimes(1);
      expect(store.applyEdit).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.h2',
        'yes, two bays',
        new Date(1761000900 * 1000),
        true,
      );
      expect(redisStore.has('wa:msg:pending:company-1:user-1:wamid.h2')).toBe(
        false,
      );
    });

    it('leaves a parked change alone for a row this delivery did not insert', async () => {
      store.addHistoryMessages.mockResolvedValueOnce(['wamid.h1']);
      redisStore.set('wa:msg:pending:company-1:user-1:wamid.h2', {
        kind: 'edit',
        body: 'yes, two bays',
        at: 1761000900 * 1000,
        fromMe: true,
      });

      await service.processEnvelope(
        coexistenceEnvelope('history', historyValue(40)),
      );

      expect(store.applyEdit).not.toHaveBeenCalled();
      expect(redisStore.has('wa:msg:pending:company-1:user-1:wamid.h2')).toBe(
        true,
      );
    });

    it('skips a thread with nothing storable', async () => {
      await service.processEnvelope(
        coexistenceEnvelope('history', {
          history: [
            {
              metadata: { phase: 0, chunk_order: 1, progress: 40 },
              threads: [{ id: '971501234567', messages: [{ id: 'wamid.x' }] }],
            },
          ],
        }),
      );

      expect(store.addHistoryMessages).not.toHaveBeenCalled();
    });

    it('applies a customer delete parked for one of their history messages', async () => {
      redisStore.set('wa:msg:pending:company-1:user-1:wamid.h1', {
        kind: 'revoke',
        at: 1761000900 * 1000,
        fromMe: false,
      });

      await service.processEnvelope(
        coexistenceEnvelope('history', historyValue(40)),
      );

      expect(store.markDeleted).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.h1',
        new Date(1761000900 * 1000),
        false,
      );
    });

    it('ignores history when no request was made recently', async () => {
      const stale = connectionRow();
      stale.historySyncRequestedAt = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000,
      );
      repo.findOne.mockResolvedValue(stale);

      await service.processEnvelope(
        coexistenceEnvelope('history', historyValue(40)),
      );

      expect(store.addHistoryMessages).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('records no progress for a chunk with a failed thread, so the retry can', async () => {
      store.addHistoryMessages.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.processEnvelope(
          coexistenceEnvelope('history', historyValue(100)),
        ),
      ).rejects.toThrow('db down');

      expect(repo.update).not.toHaveBeenCalled();
      expect(gateway.emitHistory).not.toHaveBeenCalled();
    });

    it('records a declined sync and stores nothing', async () => {
      await service.processEnvelope(
        coexistenceEnvelope('history', {
          history: [
            {
              errors: [
                {
                  code: 2593109,
                  title:
                    'History sync is turned off by the business from the WhatsApp Business App',
                },
              ],
            },
          ],
        }),
      );

      expect(store.addHistoryMessages).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'conn-1', historySyncStatus: expect.anything() },
        {
          historySyncStatus: WhatsappHistorySyncStatus.DECLINED,
          historySyncProgress: null,
        },
      );
    });
  });

  describe('smb_message_echoes', () => {
    const echo = (message: Record<string, unknown>) =>
      coexistenceEnvelope('smb_message_echoes', {
        message_echoes: [
          {
            from: '15550001111',
            to: '971501234567',
            timestamp: '1761000200',
            ...message,
          },
        ],
      });

    it('stores a phone reply as outgoing, pushes it and pauses the AI', async () => {
      await service.processEnvelope(
        echo({
          id: 'wamid.e1',
          type: 'text',
          text: { body: 'calling you now' },
        }),
      );

      expect(store.addMessage).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        expect.objectContaining({
          id: 'wamid.e1',
          chatId: '971501234567',
          fromMe: true,
          aiGenerated: false,
          body: 'calling you now',
        }),
        'phone-1',
      );
      expect(gateway.emitMessage).toHaveBeenCalledTimes(1);
      expect(ai.recordHumanReply).toHaveBeenCalledWith(
        'user-1',
        '971501234567',
        1761000200 * 1000,
      );
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('does nothing more for an echo already stored', async () => {
      store.addMessage.mockResolvedValue(stored(false));

      await service.processEnvelope(
        echo({
          id: 'wamid.e1',
          type: 'text',
          text: { body: 'calling you now' },
        }),
      );

      expect(gateway.emitMessage).not.toHaveBeenCalled();
      expect(ai.recordHumanReply).not.toHaveBeenCalled();
    });

    it('redoes the AI pause on our own retry of a stored echo, without a second push', async () => {
      store.addMessage.mockResolvedValue(stored(false));

      await service.processEnvelope(
        echo({
          id: 'wamid.e1',
          type: 'text',
          text: { body: 'calling you now' },
        }),
        true,
      );

      expect(gateway.emitMessage).not.toHaveBeenCalled();
      expect(ai.recordHumanReply).toHaveBeenCalledWith(
        'user-1',
        '971501234567',
        1761000200 * 1000,
      );
    });

    it('applies an edit to the original message', async () => {
      await service.processEnvelope(
        echo({
          id: 'wamid.e2',
          type: 'edit',
          edit: {
            original_message_id: 'wamid.e1',
            message: { type: 'text', text: { body: 'calling in 5' } },
          },
        }),
      );

      expect(store.applyEdit).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.e1',
        'calling in 5',
        new Date(1761000200 * 1000),
        true,
      );
      expect(store.addMessage).not.toHaveBeenCalled();
    });

    const PENDING_KEY = 'wa:msg:pending:company-1:user-1:wamid.e1';
    const editOf = (id: string, body: string, timestamp = '1761000200') =>
      echo({
        id,
        type: 'edit',
        timestamp,
        edit: {
          original_message_id: 'wamid.e1',
          message: { type: 'text', text: { body } },
        },
      });

    it('parks an edit that beats its original, without failing the job', async () => {
      store.applyEdit.mockResolvedValue(false);
      store.hasMessage.mockResolvedValue(false);

      await expect(
        service.processEnvelope(editOf('wamid.e2', 'calling in 5')),
      ).resolves.toBeUndefined();

      expect(redisStore.get(PENDING_KEY)).toEqual({
        kind: 'edit',
        body: 'calling in 5',
        at: 1761000200 * 1000,
        fromMe: true,
      });
    });

    it('parks a delete that beats its original, and a later edit cannot replace it', async () => {
      store.markDeleted.mockResolvedValue(false);
      store.applyEdit.mockResolvedValue(false);
      store.hasMessage.mockResolvedValue(false);

      await service.processEnvelope(
        echo({
          id: 'wamid.e3',
          type: 'revoke',
          revoke: { original_message_id: 'wamid.e1' },
        }),
      );
      await service.processEnvelope(editOf('wamid.e4', 'late', '1761000300'));

      expect(redisStore.get(PENDING_KEY)).toMatchObject({ kind: 'revoke' });
    });

    it('keeps the newer of two parked edits', async () => {
      store.applyEdit.mockResolvedValue(false);
      store.hasMessage.mockResolvedValue(false);

      await service.processEnvelope(editOf('wamid.e5', 'newer', '1761000300'));
      await service.processEnvelope(editOf('wamid.e6', 'older', '1761000100'));

      expect(redisStore.get(PENDING_KEY)).toMatchObject({ body: 'newer' });
    });

    it('applies a parked edit when the original arrives, then clears it', async () => {
      redisStore.set(PENDING_KEY, {
        kind: 'edit',
        body: 'calling in 5',
        at: 1761000300 * 1000,
        fromMe: true,
      });

      await service.processEnvelope(
        echo({
          id: 'wamid.e1',
          type: 'text',
          text: { body: 'calling you now' },
        }),
      );

      expect(store.applyEdit).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.e1',
        'calling in 5',
        new Date(1761000300 * 1000),
        true,
      );
      expect(redisStore.has(PENDING_KEY)).toBe(false);
    });

    it('does not park an edit whose original is stored but newer', async () => {
      store.applyEdit.mockResolvedValue(false);
      store.hasMessage.mockResolvedValue(true);

      await service.processEnvelope(editOf('wamid.e2', 'old edit'));

      expect(redis.setJson).not.toHaveBeenCalled();
    });

    it('applies at once when the original lands while the edit is being parked', async () => {
      store.applyEdit.mockResolvedValueOnce(false);
      store.hasMessage.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      await service.processEnvelope(editOf('wamid.e2', 'calling in 5'));

      expect(store.applyEdit).toHaveBeenCalledTimes(2);
      expect(redisStore.has(PENDING_KEY)).toBe(false);
    });

    it('pushes the updated message live once an edit is applied', async () => {
      const updated = { id: 'wamid.e1', body: 'calling in 5', editedAt: 1 };
      store.getMessage.mockResolvedValue(updated);

      await service.processEnvelope(editOf('wamid.e2', 'calling in 5'));

      expect(store.getMessage).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.e1',
      );
      expect(gateway.emitMessageUpdate).toHaveBeenCalledWith('user-1', updated);
    });

    it('pushes nothing when the edit changed no row', async () => {
      store.applyEdit.mockResolvedValue(false);

      await service.processEnvelope(editOf('wamid.e2', 'calling in 5'));

      expect(store.getMessage).not.toHaveBeenCalled();
      expect(gateway.emitMessage).not.toHaveBeenCalled();
      expect(gateway.emitMessageUpdate).not.toHaveBeenCalled();
    });

    it('marks the original message revoked on a delete', async () => {
      await service.processEnvelope(
        echo({
          id: 'wamid.e3',
          type: 'revoke',
          revoke: { original_message_id: 'wamid.e1' },
        }),
      );

      expect(store.markDeleted).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.e1',
        new Date(1761000200 * 1000),
        true,
      );
      expect(store.addMessage).not.toHaveBeenCalled();
    });

    it('stores a media echo as PENDING outgoing media and queues its download', async () => {
      await service.processEnvelope(
        echo({
          id: 'wamid.e4',
          type: 'image',
          image: { id: 'media-1', mime_type: 'image/jpeg', sha256: 'abc=' },
        }),
      );

      const [, , msg] = store.addMessage.mock.calls[0];
      expect(msg).toEqual(
        expect.objectContaining({
          id: 'wamid.e4',
          body: '',
          fromMe: true,
          hasMedia: true,
          mediaType: 'image',
          mediaMetaId: 'media-1',
          mediaStatus: WaMediaStatus.PENDING,
          mediaFileName: 'image-wamid_e4.jpg',
        }),
      );
      expect(mediaQueue.add).toHaveBeenCalledWith(
        'ingest',
        { messageUuid: msg.uuid, companyId: 'company-1' },
        { jobId: msg.uuid },
      );
      const pushed = gateway.emitMessage.mock.calls[0][1];
      expect(pushed).not.toHaveProperty('mediaMetaId');
      expect(pushed).not.toHaveProperty('mediaSha256');
    });

    it('still applies a parked change and pauses the AI when queueing echo media fails', async () => {
      mediaQueue.add.mockRejectedValue(new Error('valkey down'));
      redisStore.set('wa:msg:pending:company-1:user-1:wamid.e6', {
        kind: 'revoke',
        at: 1761000300000,
        fromMe: true,
      });

      await expect(
        service.processEnvelope(
          echo({
            id: 'wamid.e6',
            type: 'image',
            image: { id: 'media-6', mime_type: 'image/jpeg' },
          }),
        ),
      ).rejects.toThrow('valkey down');

      expect(store.markDeleted).toHaveBeenCalled();
      expect(ai.recordHumanReply).toHaveBeenCalledWith(
        'user-1',
        '971501234567',
        1761000200000,
      );
    });

    it('stores a location echo as a placeholder, as before', async () => {
      await service.processEnvelope(
        echo({ id: 'wamid.e5', type: 'location', location: {} }),
      );

      expect(store.addMessage).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        expect.objectContaining({ id: 'wamid.e5', body: '[Location]' }),
        'phone-1',
      );
      expect(mediaQueue.add).not.toHaveBeenCalled();
    });

    it('ignores an echo for an unknown number', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.processEnvelope(
        echo({ id: 'wamid.e1', type: 'text', text: { body: 'hi' } }),
      );

      expect(store.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('customer deletes and edits', () => {
    const inboundChange = (message: Record<string, unknown>) =>
      coexistenceEnvelope('messages', {
        contacts: [{ profile: { name: 'Zainab' }, wa_id: '971501234567' }],
        messages: [
          { from: '971501234567', timestamp: '1761000400', ...message },
        ],
      });

    it('applies a customer delete to the customer message only', async () => {
      await service.processEnvelope(
        inboundChange({
          id: 'wamid.r1',
          type: 'revoke',
          revoke: { original_message_id: 'wamid.1' },
        }),
      );

      expect(store.markDeleted).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.1',
        new Date(1761000400 * 1000),
        false,
      );
      expect(store.addMessage).not.toHaveBeenCalled();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('applies a customer edit to the customer message only', async () => {
      await service.processEnvelope(
        inboundChange({
          id: 'wamid.x1',
          type: 'edit',
          edit: {
            original_message_id: 'wamid.1',
            message: { type: 'text', text: { body: 'TWO' } },
          },
        }),
      );

      expect(store.applyEdit).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.1',
        'TWO',
        new Date(1761000400 * 1000),
        false,
      );
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('skips the AI for a message the customer deleted before it was stored', async () => {
      redisStore.set('wa:msg:pending:company-1:user-1:wamid.1', {
        kind: 'revoke',
        at: 1761234600 * 1000,
        fromMe: false,
      });
      store.getMessage.mockResolvedValue({ id: 'wamid.1', deletedAt: 1 });

      await service.processEnvelope(inboundEnvelope());

      expect(store.markDeleted).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        'wamid.1',
        new Date(1761234600 * 1000),
        false,
      );
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('hands the AI the text as stored, so an applied edit wins', async () => {
      store.getMessage.mockResolvedValue({
        id: 'wamid.1',
        body: 'edited text',
        deletedAt: null,
      });

      await service.processEnvelope(inboundEnvelope());

      expect(ai.handleIncomingMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wamid.1', body: 'edited text' }),
        'company-1',
        'user-1',
      );
    });

    it('rethrows a failed customer change so BullMQ retries it', async () => {
      store.markDeleted.mockRejectedValue(new Error('db down'));

      await expect(
        service.processEnvelope(
          inboundChange({
            id: 'wamid.r1',
            type: 'revoke',
            revoke: { original_message_id: 'wamid.1' },
          }),
        ),
      ).rejects.toThrow('db down');
    });
  });

  describe('inbound media', () => {
    const mediaEnvelope = (message: Record<string, unknown>) =>
      coexistenceEnvelope('messages', {
        contacts: [{ profile: { name: 'Zainab' }, wa_id: '971501234567' }],
        messages: [
          {
            from: '971501234567',
            id: 'wamid.m1',
            timestamp: String(Math.floor(Date.now() / 1000)),
            ...message,
          },
        ],
      });
    const storedMsg = () =>
      store.addMessage.mock.calls[0][2] as WaMessage & {
        mediaMetaId?: string | null;
        mediaSha256?: string | null;
      };

    beforeEach(() => {
      // Read-back returns what was inserted, as the real store would.
      store.getMessage.mockImplementation(
        (_c: string, _u: string, id: string) => {
          const call = store.addMessage.mock.calls.find(
            (args) => (args[2] as WaMessage).id === id,
          );
          return Promise.resolve(call ? call[2] : null);
        },
      );
    });

    it('stores an image with its caption as PENDING and queues it by row id', async () => {
      await service.processEnvelope(
        mediaEnvelope({
          type: 'image',
          image: {
            id: 'meta-media-1',
            mime_type: 'image/jpeg',
            sha256: 'hash=',
            caption: 'the kitchen',
          },
        }),
      );

      const msg = storedMsg();
      expect(msg).toEqual(
        expect.objectContaining({
          body: 'the kitchen',
          hasMedia: true,
          mediaType: 'image',
          mediaMetaId: 'meta-media-1',
          mediaMime: 'image/jpeg',
          mediaSha256: 'hash=',
          mediaFileName: 'image-wamid_m1.jpg',
          mediaStatus: WaMediaStatus.PENDING,
          fromMe: false,
        }),
      );
      expect(mediaQueue.add).toHaveBeenCalledWith(
        'ingest',
        { messageUuid: msg.uuid, companyId: 'company-1' },
        { jobId: msg.uuid },
      );
      expect(gateway.emitMessage).toHaveBeenCalledTimes(1);
      expect(ai.handleIncomingMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          hasMedia: true,
          mediaType: 'image',
          body: 'the kitchen',
        }),
        'company-1',
        'user-1',
      );
    });

    it('stores a voice note as audio with an empty body', async () => {
      await service.processEnvelope(
        mediaEnvelope({
          type: 'audio',
          audio: {
            id: 'meta-voice',
            mime_type: 'audio/ogg; codecs=opus',
            sha256: 'h=',
            voice: true,
          },
        }),
      );

      expect(storedMsg()).toEqual(
        expect.objectContaining({
          body: '',
          mediaType: 'audio',
          mediaFileName: 'audio-wamid_m1.ogg',
          mediaStatus: WaMediaStatus.PENDING,
        }),
      );
      expect(mediaQueue.add).toHaveBeenCalledTimes(1);
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
    });

    it("keeps a document's own file name", async () => {
      await service.processEnvelope(
        mediaEnvelope({
          type: 'document',
          document: {
            id: 'meta-doc',
            mime_type: 'application/pdf',
            sha256: 'h=',
            filename: 'Tenancy Contract.pdf',
          },
        }),
      );

      expect(storedMsg()).toEqual(
        expect.objectContaining({
          mediaType: 'document',
          mediaFileName: 'Tenancy Contract.pdf',
        }),
      );
    });

    it('stores a 131052 message as TOO_LARGE without a download', async () => {
      await service.processEnvelope(
        mediaEnvelope({
          type: 'unsupported',
          errors: [{ code: 131052, title: 'Media file size too big' }],
        }),
      );

      expect(storedMsg()).toEqual(
        expect.objectContaining({
          body: '',
          hasMedia: true,
          mediaType: 'media_placeholder',
          mediaStatus: WaMediaStatus.TOO_LARGE,
        }),
      );
      expect(mediaQueue.add).not.toHaveBeenCalled();
    });

    it('keeps the media type on a 131052 video', async () => {
      await service.processEnvelope(
        mediaEnvelope({
          type: 'video',
          video: { id: 'meta-video' },
          errors: [{ code: 131052 }],
        }),
      );

      expect(storedMsg()).toEqual(
        expect.objectContaining({
          mediaType: 'video',
          mediaStatus: WaMediaStatus.TOO_LARGE,
        }),
      );
      expect(mediaQueue.add).not.toHaveBeenCalled();
    });

    it('queues the stored row id, not the built one, on our own retry of a conflict', async () => {
      store.addMessage.mockResolvedValue(stored(false));
      store.getMessage.mockResolvedValue({
        uuid: 'row-uuid-existing',
        id: 'wamid.m1',
        mediaStatus: WaMediaStatus.PENDING,
        body: '',
      });

      await service.processEnvelope(
        mediaEnvelope({
          type: 'image',
          image: { id: 'meta-media-1', mime_type: 'image/jpeg' },
        }),
        true,
      );

      expect(mediaQueue.add).toHaveBeenCalledWith(
        'ingest',
        { messageUuid: 'row-uuid-existing', companyId: 'company-1' },
        { jobId: 'row-uuid-existing' },
      );
    });

    it('still drops a location message', async () => {
      await service.processEnvelope(
        mediaEnvelope({ type: 'location', location: {} }),
      );

      expect(store.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('history media', () => {
    it('downloads media under 14 days old and keeps older media as a placeholder', async () => {
      store.findPendingMediaUuids.mockResolvedValue(['row-recent', 'row-dup']);
      const nowS = Math.floor(Date.now() / 1000);
      const day = 24 * 60 * 60;
      await service.processEnvelope(
        coexistenceEnvelope('history', {
          history: [
            {
              metadata: { progress: 50 },
              threads: [
                {
                  id: '971501234567',
                  messages: [
                    {
                      id: 'wamid.recent',
                      from: '971501234567',
                      timestamp: String(nowS - 13 * day),
                      type: 'image',
                      image: { id: 'meta-recent', mime_type: 'image/png' },
                    },
                    {
                      id: 'wamid.old',
                      from: '971501234567',
                      timestamp: String(nowS - 15 * day),
                      type: 'image',
                      image: { id: 'meta-old', mime_type: 'image/png' },
                    },
                    {
                      id: 'wamid.dup',
                      from: '971501234567',
                      timestamp: String(nowS - 2 * day),
                      type: 'video',
                      video: { id: 'meta-dup', mime_type: 'video/mp4' },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );

      const items = store.addHistoryMessages.mock.calls[0][3] as {
        msg: WaMessage & { mediaMetaId?: string | null };
      }[];
      const byId = new Map(items.map((item) => [item.msg.id, item.msg]));
      expect(byId.get('wamid.recent')).toEqual(
        expect.objectContaining({
          body: '',
          hasMedia: true,
          mediaMetaId: 'meta-recent',
          mediaStatus: WaMediaStatus.PENDING,
        }),
      );
      const old = byId.get('wamid.old');
      expect(old).toEqual(
        expect.objectContaining({
          body: '[Image]',
          hasMedia: false,
          mediaType: 'image',
          mediaStatus: null,
        }),
      );
      expect(old?.mediaMetaId).toBeUndefined();

      expect(store.findPendingMediaUuids).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        ['wamid.recent', 'wamid.dup'],
      );
      expect(mediaQueue.add).not.toHaveBeenCalled();
      expect(mediaQueue.addBulk).toHaveBeenCalledTimes(1);
      expect(mediaQueue.addBulk).toHaveBeenCalledWith([
        {
          name: 'ingest',
          data: { messageUuid: 'row-recent', companyId: 'company-1' },
          opts: { jobId: 'row-recent' },
        },
        {
          name: 'ingest',
          data: { messageUuid: 'row-dup', companyId: 'company-1' },
          opts: { jobId: 'row-dup' },
        },
      ]);
    });

    it('queues the stored PENDING rows even when this delivery inserted none', async () => {
      store.addHistoryMessages.mockResolvedValue([]);
      store.findPendingMediaUuids.mockResolvedValue(['row-9']);
      const nowS = Math.floor(Date.now() / 1000);
      await service.processEnvelope(
        coexistenceEnvelope('history', {
          history: [
            {
              threads: [
                {
                  id: '971501234567',
                  messages: ['wamid.recent', 'wamid.dup'].map((id) => ({
                    id,
                    from: '971501234567',
                    timestamp: String(nowS - 60),
                    type: 'image',
                    image: { id: `meta-${id}`, mime_type: 'image/png' },
                  })),
                },
              ],
            },
          ],
        }),
      );

      expect(mediaQueue.addBulk).toHaveBeenCalledWith([
        {
          name: 'ingest',
          data: { messageUuid: 'row-9', companyId: 'company-1' },
          opts: { jobId: 'row-9' },
        },
      ]);
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('fails the chunk for a retry when the bulk queue write fails', async () => {
      store.findPendingMediaUuids.mockResolvedValue(['row-9']);
      mediaQueue.addBulk.mockRejectedValue(new Error('valkey down'));
      await expect(
        service.processEnvelope(
          coexistenceEnvelope('history', {
            history: [
              {
                threads: [
                  {
                    id: '971501234567',
                    messages: [
                      {
                        id: 'wamid.recent',
                        from: '971501234567',
                        timestamp: String(Math.floor(Date.now() / 1000) - 60),
                        type: 'image',
                        image: { id: 'meta-recent', mime_type: 'image/png' },
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        ),
      ).rejects.toThrow('valkey down');
    });

    it('does not read pending media for a thread without downloadable media', async () => {
      await service.processEnvelope(
        coexistenceEnvelope('history', {
          history: [
            {
              threads: [
                {
                  id: '971501234567',
                  messages: [
                    {
                      id: 'wamid.text',
                      from: '971501234567',
                      timestamp: String(Math.floor(Date.now() / 1000) - 60),
                      type: 'text',
                      text: { body: 'hello' },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );

      expect(store.addHistoryMessages).toHaveBeenCalled();
      expect(store.findPendingMediaUuids).not.toHaveBeenCalled();
    });
  });

  describe('revoke of stored media', () => {
    const revoke = (fromMe: boolean) =>
      fromMe
        ? coexistenceEnvelope('smb_message_echoes', {
            message_echoes: [
              {
                from: '15550001111',
                to: '971501234567',
                id: 'wamid.rv',
                timestamp: '1761000400',
                type: 'revoke',
                revoke: { original_message_id: 'wamid.1' },
              },
            ],
          })
        : coexistenceEnvelope('messages', {
            messages: [
              {
                from: '971501234567',
                id: 'wamid.rv',
                timestamp: '1761000400',
                type: 'revoke',
                revoke: { original_message_id: 'wamid.1' },
              },
            ],
          });

    it('purges STORED media with the customer reason', async () => {
      store.getMessage.mockResolvedValue({
        uuid: 'row-1',
        id: 'wamid.1',
        mediaStatus: WaMediaStatus.STORED,
      });

      await service.processEnvelope(revoke(false));

      expect(media.deleteStoredMedia).toHaveBeenCalledWith(
        'company-1',
        'row-1',
        'CUSTOMER_REVOKE',
      );
    });

    it('hands PENDING media to the same revoke path after markDeleted', async () => {
      store.getMessage.mockResolvedValue({
        uuid: 'row-1',
        id: 'wamid.1',
        mediaStatus: WaMediaStatus.PENDING,
      });

      await service.processEnvelope(revoke(true));

      expect(media.deleteStoredMedia).toHaveBeenCalledWith(
        'company-1',
        'row-1',
        'BUSINESS_APP_REVOKE',
      );
      expect(store.markDeleted.mock.invocationCallOrder[0]).toBeLessThan(
        media.deleteStoredMedia.mock.invocationCallOrder[0],
      );
    });

    it('purges STORED media with the business app reason', async () => {
      store.getMessage.mockResolvedValue({
        uuid: 'row-1',
        id: 'wamid.1',
        mediaStatus: WaMediaStatus.STORED,
      });

      await service.processEnvelope(revoke(true));

      expect(media.deleteStoredMedia).toHaveBeenCalledWith(
        'company-1',
        'row-1',
        'BUSINESS_APP_REVOKE',
      );
    });

    it('does not purge for a text row', async () => {
      store.getMessage.mockResolvedValue({
        uuid: 'row-1',
        id: 'wamid.1',
        mediaStatus: null,
      });

      await service.processEnvelope(revoke(false));

      expect(store.markDeleted).toHaveBeenCalled();
      expect(media.deleteStoredMedia).not.toHaveBeenCalled();
    });

    it('keeps the revoke when the purge fails', async () => {
      store.getMessage.mockResolvedValue({
        uuid: 'row-1',
        id: 'wamid.1',
        mediaStatus: WaMediaStatus.STORED,
      });
      media.deleteStoredMedia.mockRejectedValue(new Error('bucket down'));

      await expect(
        service.processEnvelope(revoke(false)),
      ).resolves.toBeUndefined();
      expect(gateway.emitMessageUpdate).toHaveBeenCalled();
    });
  });
});
