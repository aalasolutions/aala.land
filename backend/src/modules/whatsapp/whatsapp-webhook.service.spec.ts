import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { createHmac } from 'node:crypto';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from './entities/whatsapp-connection.entity';
import { WhatsappMessageStatus } from './entities/whatsapp-message.entity';
import { WhatsappAiService } from './whatsapp-ai.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { WA_WEBHOOK_EVENTS_QUEUE } from './wa-types';

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
  row.companyId = 'company-1';
  row.userId = 'user-1';
  row.phoneNumberId = 'phone-1';
  row.wabaId = 'waba-1';
  row.status = WhatsappConnectionStatus.CONNECTED;
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

describe('WhatsappWebhookService', () => {
  let service: WhatsappWebhookService;
  let ai: { handleIncomingMessage: jest.Mock };
  let repo: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let store: { addMessage: jest.Mock; applyMessageStatus: jest.Mock };
  let gateway: { emitMessage: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
    ai = { handleIncomingMessage: jest.fn().mockResolvedValue(undefined) };
    repo = {
      findOne: jest.fn().mockResolvedValue(connectionRow()),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    store = {
      addMessage: jest.fn().mockResolvedValue(true),
      applyMessageStatus: jest.fn().mockResolvedValue(true),
    };
    gateway = { emitMessage: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsappWebhookService,
        { provide: getRepositoryToken(WhatsappConnection), useValue: repo },
        { provide: MessageStoreService, useValue: store },
        { provide: WhatsappGateway, useValue: gateway },
        { provide: WhatsappAiService, useValue: ai },
        { provide: getQueueToken(WA_WEBHOOK_EVENTS_QUEUE), useValue: queue },
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

      await expect(service.handleWebhook(rawBody, signature)).rejects.toThrow(
        ForbiddenException,
      );
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

    it('still emits and dispatches when persistence fails', async () => {
      store.addMessage.mockRejectedValue(new Error('db down'));

      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).resolves.toBeUndefined();
      expect(gateway.emitMessage).toHaveBeenCalledTimes(1);
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
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
  });

  // Phase 7: once a departing agent's number is disconnected, nothing it receives may
  // reach the AI, because a turn is what consumes a credit.
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
      store.addMessage.mockResolvedValue(false);

      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).resolves.toBeUndefined();
      expect(store.addMessage).toHaveBeenCalledTimes(1);
      expect(gateway.emitMessage).not.toHaveBeenCalled();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('still dispatches a message the store has not seen', async () => {
      store.addMessage.mockResolvedValue(true);

      await service.processEnvelope(inboundEnvelope());
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
    });

    // A BullMQ retry replays the whole envelope; the wamid dedupe is what makes that safe.
    it('dispatches once when the same envelope is processed twice', async () => {
      store.addMessage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const envelope = inboundEnvelope();

      await service.processEnvelope(envelope);
      await service.processEnvelope(envelope);

      expect(store.addMessage).toHaveBeenCalledTimes(2);
      expect(ai.handleIncomingMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-message failures never fail the envelope', () => {
    it('does not throw when the AI dispatch throws', async () => {
      ai.handleIncomingMessage.mockRejectedValue(new Error('llm down'));

      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).resolves.toBeUndefined();
    });

    it('does not throw when the live push throws', async () => {
      gateway.emitMessage.mockImplementation(() => {
        throw new Error('socket gone');
      });

      await expect(
        service.processEnvelope(inboundEnvelope()),
      ).resolves.toBeUndefined();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('keeps processing the rest of the batch after one message fails', async () => {
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

      await expect(service.processEnvelope(envelope)).resolves.toBeUndefined();
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
        entry: { changes: { value: { messages: Record<string, unknown>[] } }[] }[];
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

    it('does not throw when the status write throws', async () => {
      store.applyMessageStatus.mockRejectedValue(new Error('db down'));

      await expect(
        service.processEnvelope(statusEnvelope()),
      ).resolves.toBeUndefined();
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

  // account_update carries no metadata.phone_number_id, so it is routed off entry.id.
  // Before this existed the whole field was dropped on the phone-number guard.
  describe('account_update', () => {
    // A real CONNECTED or FLAGGED row always holds a token; the status handlers now refuse
    // to promote one that does not.
    const rowFor = (overrides: Partial<WhatsappConnection> = {}) =>
      Object.assign(
        connectionRow(),
        { id: 'conn-1', accessTokenCiphertext: 'v1.iv.tag.ct' },
        overrides,
      );

    it('disconnects on PARTNER_REMOVED and keeps Meta reason', async () => {
      repo.find.mockResolvedValue([rowFor()]);

      await service.processEnvelope(
        accountUpdateEnvelope({
          event: 'PARTNER_REMOVED',
          disconnection_info: { reason: 'PRIMARY_INACTIVITY', initiated_by: 'SYSTEM' },
        }),
      );

      const [where, patch] = repo.update.mock.calls[0];
      expect(where).toEqual({ id: 'conn-1' });
      expect(patch.status).toBe(WhatsappConnectionStatus.DISCONNECTED);
      expect(patch.disconnectReason).toBe('PRIMARY_INACTIVITY');
    });

    it('falls back to the event name when no disconnection reason is sent', async () => {
      repo.find.mockResolvedValue([rowFor()]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_REMOVED' }),
      );

      expect(repo.update.mock.calls[0][1].disconnectReason).toBe(
        'PARTNER_REMOVED',
      );
    });

    // Meta documents a device change as self-healing, so it is a suspension. FLAGGED keeps
    // inbound flowing; DISCONNECTED would drop the lead's messages on the floor.
    it('flags rather than disconnects on ACCOUNT_OFFBOARDED', async () => {
      repo.find.mockResolvedValue([rowFor()]);

      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'ACCOUNT_OFFBOARDED' }),
      );

      expect(repo.update.mock.calls[0][1].status).toBe(
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

      const patch = repo.update.mock.calls[0][1];
      expect(patch.status).toBe(WhatsappConnectionStatus.CONNECTED);
      expect(patch.disconnectReason).toBeNull();
      expect(patch.disconnectedAt).toBeNull();
    });

    it('promotes a PENDING row on PARTNER_ADDED but leaves a CONNECTED one alone', async () => {
      repo.find.mockResolvedValue([
        rowFor({ status: WhatsappConnectionStatus.PENDING }),
      ]);
      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_ADDED' }),
      );
      expect(repo.update.mock.calls[0][1].status).toBe(
        WhatsappConnectionStatus.CONNECTED,
      );

      repo.update.mockClear();
      repo.find.mockResolvedValue([rowFor()]);
      await service.processEnvelope(
        accountUpdateEnvelope({ event: 'PARTNER_ADDED' }),
      );
      expect(repo.update).not.toHaveBeenCalled();
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

    // One WABA can host up to 20 numbers, and Graph and the webhook format the display
    // number differently, so the match is on digits.
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

      expect(repo.update.mock.calls[0][0]).toEqual({ id: 'conn-b' });
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

    // A WABA hosts up to 20 numbers and we may hold only one. An event about a sibling
    // number used to disconnect ours, because the single-row branch never read phone_number.
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

      expect(repo.update.mock.calls[0][1].status).toBe(
        WhatsappConnectionStatus.DISCONNECTED,
      );
    });

    // The row has no token after a self-disconnect, so flipping it to CONNECTED would show
    // "Connected" on the card while every send fails at the token check.
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

      expect(repo.update).not.toHaveBeenCalled();
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
});
