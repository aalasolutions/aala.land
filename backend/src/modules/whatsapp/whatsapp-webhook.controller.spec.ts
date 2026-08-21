import { Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { ResponseInterceptor } from '@shared/interceptors/response.interceptor';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from './entities/whatsapp-connection.entity';
import { WhatsappAiService } from './whatsapp-ai.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { WA_WEBHOOK_EVENTS_QUEUE } from './wa-types';

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

function sign(rawBody: string): string {
  return (
    'sha256=' +
    createHmac('sha256', APP_SECRET)
      .update(Buffer.from(rawBody, 'utf8'))
      .digest('hex')
  );
}

function connectionRow(): WhatsappConnection {
  const row = new WhatsappConnection();
  row.companyId = 'company-1';
  row.userId = 'user-1';
  row.phoneNumberId = 'phone-1';
  row.status = WhatsappConnectionStatus.CONNECTED;
  return row;
}

function inboundBody(body: string, waId = 'wamid.1'): string {
  return JSON.stringify({
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
                  id: waId,
                  timestamp: '1761234567',
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

// HTTP-level, not a hand-called controller method: the real pipeline is the thing under
// test here. rawBody, the global ResponseInterceptor and the global ValidationPipe are all
// the ones main.ts installs, because each of them can break the Meta contract on its own.
// The route is fast-ack now, so the assertions land on the enqueue; the processing
// behavior it used to drive inline is proven against processEnvelope in the service spec.
describe('WhatsappWebhookController (HTTP)', () => {
  let app: NestExpressApplication;
  let ai: { handleIncomingMessage: jest.Mock };
  let store: { addMessage: jest.Mock; applyMessageStatus: jest.Mock };
  let gateway: { emitMessage: jest.Mock };
  let repo: { findOne: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
    ai = { handleIncomingMessage: jest.fn().mockResolvedValue(undefined) };
    store = {
      addMessage: jest.fn().mockResolvedValue(true),
      applyMessageStatus: jest.fn().mockResolvedValue(true),
    };
    gateway = { emitMessage: jest.fn() };
    repo = { findOne: jest.fn().mockResolvedValue(connectionRow()) };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const moduleRef = await Test.createTestingModule({
      controllers: [WhatsappWebhookController],
      providers: [
        WhatsappWebhookService,
        { provide: getRepositoryToken(WhatsappConnection), useValue: repo },
        { provide: MessageStoreService, useValue: store },
        { provide: WhatsappGateway, useValue: gateway },
        { provide: WhatsappAiService, useValue: ai },
        { provide: getQueueToken(WA_WEBHOOK_EVENTS_QUEUE), useValue: queue },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    app.useBodyParser('json', { limit: '4mb' });
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    jest.restoreAllMocks();
    await app.close();
  });

  describe('GET /whatsapp/webhook', () => {
    it('returns the raw challenge with no response envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': '1158201444',
        })
        .expect(200);

      expect(res.text).toBe('1158201444');
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).not.toContain('success');
      expect(res.text).not.toContain('data');
    });

    it('answers 403 in plain text on a wrong verify token', async () => {
      const res = await request(app.getHttpServer())
        .get('/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'nope',
          'hub.challenge': '1158201444',
        })
        .expect(403);

      expect(res.text).not.toContain('1158201444');
    });

    it('answers 403 when the verify token is not configured', async () => {
      delete process.env.WHATSAPP_VERIFY_TOKEN;

      await request(app.getHttpServer())
        .get('/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'anything',
          'hub.challenge': '1158201444',
        })
        .expect(403);
    });
  });

  describe('POST /whatsapp/webhook', () => {
    it('accepts a validly signed payload and enqueues it', async () => {
      const raw = inboundBody('hello, is the unit still available?');

      const res = await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', sign(raw))
        .send(raw)
        .expect(200);

      // The envelope is fine here: Meta reads the status code, not the body.
      expect(res.body).toEqual({ success: true, data: { received: true } });
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add.mock.calls[0][1]).toEqual({
        envelope: JSON.parse(raw),
      });
      // Fast ack: nothing downstream runs on the request thread.
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(store.addMessage).not.toHaveBeenCalled();
      expect(gateway.emitMessage).not.toHaveBeenCalled();
      expect(ai.handleIncomingMessage).not.toHaveBeenCalled();
    });

    it('rejects a payload signed with the wrong secret', async () => {
      const raw = inboundBody('hello');
      const badSignature =
        'sha256=' +
        createHmac('sha256', 'other-secret').update(raw).digest('hex');

      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', badSignature)
        .send(raw)
        .expect(403);

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('rejects a payload with no signature header', async () => {
      const raw = inboundBody('hello');

      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(403);

      expect(queue.add).not.toHaveBeenCalled();
    });

    // Meta redelivers for up to 7 days. Both deliveries are acked and enqueued here; the
    // wamid dedupe that keeps the second one from starting a turn lives in processEnvelope.
    it('acks and enqueues both deliveries of the same wamid', async () => {
      const raw = inboundBody('hello again');

      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post('/whatsapp/webhook')
          .set('Content-Type', 'application/json')
          .set('x-hub-signature-256', sign(raw))
          .send(raw)
          .expect(200);
      }

      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add.mock.calls[0][1]).toEqual(queue.add.mock.calls[1][1]);
    });

    // The one case Meta is meant to retry: the queue is unreachable, so nothing was kept.
    it('answers 500 when the enqueue fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      queue.add.mockRejectedValue(new Error('redis down'));
      const raw = inboundBody('hello');

      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', sign(raw))
        .send(raw)
        .expect(500);
    });

    // Over Express's 100kb default, under the 4mb limit main.ts sets (Meta documents 3MB payloads). This also proves
    // rawBody still populates after useBodyParser: without it the HMAC could not match.
    it('accepts a body far past the Express default and keeps the bytes intact', async () => {
      const raw = inboundBody('x'.repeat(400_000));
      expect(Buffer.byteLength(raw, 'utf8')).toBeGreaterThan(100 * 1024);
      expect(Buffer.byteLength(raw, 'utf8')).toBeLessThan(2 * 1024 * 1024);

      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', sign(raw))
        .send(raw)
        .expect(200);

      expect(queue.add).toHaveBeenCalledTimes(1);
      const enqueued = queue.add.mock.calls[0][1] as {
        envelope: {
          entry: { changes: { value: { messages: { text: { body: string } }[] } }[] }[];
        };
      };
      expect(
        enqueued.envelope.entry[0].changes[0].value.messages[0].text.body,
      ).toHaveLength(400_000);
    });

    it('rejects a body past the configured limit rather than truncating it', async () => {
      const raw = inboundBody('x'.repeat(5 * 1024 * 1024));

      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', sign(raw))
        .send(raw)
        .expect(413);

      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
