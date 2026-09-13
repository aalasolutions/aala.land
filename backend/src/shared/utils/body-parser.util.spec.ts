import {
  Controller,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Request } from 'express';
import request from 'supertest';
import { configureBodyParsers } from './body-parser.util';

let captured: { rawBody?: Buffer; body?: unknown } = {};

@Controller('whatsapp')
class FakeWebhookController {
  @Post('webhook')
  @HttpCode(200)
  handle(@Req() req: RawBodyRequest<Request>): { ok: true } {
    captured = { rawBody: req.rawBody, body: req.body };
    return { ok: true };
  }
}

@Controller('leads')
class FakeLeadsController {
  @Post()
  @HttpCode(200)
  handle(@Req() req: RawBodyRequest<Request>): { ok: true } {
    captured = { rawBody: req.rawBody, body: req.body };
    return { ok: true };
  }
}

const jsonOfBytes = (bytes: number): string =>
  JSON.stringify({ pad: 'x'.repeat(bytes) });

// Mirrors main.ts: rawBody on, parsers configured, then the v1 prefix.
describe('configureBodyParsers', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    captured = {};
    const moduleRef = await Test.createTestingModule({
      controllers: [FakeWebhookController, FakeLeadsController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
      logger: false,
    });
    configureBodyParsers(app, 'v1');
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts a webhook body past 100kb and keeps the exact raw bytes', async () => {
    const raw = jsonOfBytes(400_000);
    expect(Buffer.byteLength(raw)).toBeGreaterThan(100 * 1024);

    await request(app.getHttpServer())
      .post('/v1/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);

    expect(captured.rawBody?.equals(Buffer.from(raw, 'utf8'))).toBe(true);
    expect(captured.body).toEqual(JSON.parse(raw));
  });

  it('rejects a webhook body past the 4mb limit', async () => {
    await request(app.getHttpServer())
      .post('/v1/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .send(jsonOfBytes(5 * 1024 * 1024))
      .expect(413);
  });

  it('keeps the 100kb default on every other route', async () => {
    await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Content-Type', 'application/json')
      .send(jsonOfBytes(200_000))
      .expect(413);

    expect(captured).toEqual({});
  });

  it('still parses small bodies and keeps rawBody on other routes', async () => {
    const raw = jsonOfBytes(10);

    await request(app.getHttpServer())
      .post('/v1/leads')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);

    expect(captured.body).toEqual(JSON.parse(raw));
    expect(captured.rawBody?.equals(Buffer.from(raw, 'utf8'))).toBe(true);
  });
});
