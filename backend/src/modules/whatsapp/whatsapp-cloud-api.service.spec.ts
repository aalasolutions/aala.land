import { randomBytes } from 'crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Not } from 'typeorm';
import {
  WhatsappCloudApiService,
  WhatsappMediaFetchError,
  WhatsappSendError,
} from './whatsapp-cloud-api.service';
import { WhatsappConnection } from './entities/whatsapp-connection.entity';
import { EncryptionService } from '../encryption/encryption.service';
import { GRAPH_VERSION } from './wa-types';

const KEY_ENV = 'WHATSAPP_TOKEN_ENC_KEY';

// Real encryption, not a mock: the seam is only proven if a real ciphertext round-trips.
let connection: WhatsappConnection;

const graphError = (status: number, code: number, message: string) => ({
  ok: false,
  status,
  text: async () =>
    JSON.stringify({ error: { message, code, type: 'OAuthException' } }),
});

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

describe('WhatsappCloudApiService', () => {
  let service: WhatsappCloudApiService;
  let connections: { findOne: jest.Mock; update: jest.Mock };
  let store: { addMessage: jest.Mock };
  let gateway: {
    emitMessage: jest.Mock;
    emitAi: jest.Mock;
    emitConnection: jest.Mock;
  };
  let ai: { getCreditUsage: jest.Mock };
  let encryption: EncryptionService;
  let fetchMock: jest.Mock;
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env[KEY_ENV];
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    encryption = new EncryptionService();
    connection = {
      id: 'conn-1',
      companyId: 'company-1',
      userId: 'user-1',
      phoneNumberId: 'pnid-1',
      displayPhoneNumber: '+1111111111',
      accessTokenCiphertext: encryption.encrypt('token-1'),
    } as WhatsappConnection;
    connections = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    store = { addMessage: jest.fn().mockResolvedValue(undefined) };
    gateway = {
      emitMessage: jest.fn(),
      emitAi: jest.fn(),
      emitConnection: jest.fn(),
    };
    ai = { getCreditUsage: jest.fn() };
    fetchMock = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as any);
    service = new WhatsappCloudApiService(
      connections as any,
      store as any,
      gateway as any,
      ai as any,
      encryption,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.WHATSAPP_SEND_TIMEOUT_MS;
    if (originalKey === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = originalKey;
  });

  describe('resolveAccessToken', () => {
    it('decrypts the stored ciphertext back into the bearer token', () => {
      expect(service.resolveAccessToken(connection)).toBe('token-1');
      expect(connection.accessTokenCiphertext).not.toContain('token-1');
    });

    it('returns null for a row that has no token', () => {
      expect(
        service.resolveAccessToken({
          ...connection,
          accessTokenCiphertext: null,
        }),
      ).toBeNull();
    });

    it('returns null instead of throwing for a garbage or tampered ciphertext', () => {
      jest
        .spyOn((encryption as any).logger, 'error')
        .mockImplementation(() => undefined);

      expect(
        service.resolveAccessToken({
          ...connection,
          accessTokenCiphertext: 'not-a-ciphertext',
        }),
      ).toBeNull();

      const parts = connection.accessTokenCiphertext!.split('.');
      const body = Buffer.from(parts[3], 'base64');
      body[0] ^= 0xff;
      parts[3] = body.toString('base64');
      expect(
        service.resolveAccessToken({
          ...connection,
          accessTokenCiphertext: parts.join('.'),
        }),
      ).toBeNull();
    });

    it('refuses the send when the encryption key is gone, and never throws out of decrypt', async () => {
      jest
        .spyOn((encryption as any).logger, 'error')
        .mockImplementation(() => undefined);
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      delete process.env[KEY_ENV];

      expect(service.resolveAccessToken(connection)).toBeNull();
      await expect(
        service.sendText(connection, '+923001234567', 'hello'),
      ).rejects.toBeInstanceOf(WhatsappSendError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('sendText', () => {
    it('posts to the pinned Graph version with the connection token', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.1' }] }),
      });

      const result = await service.sendText(connection, '+923001234567', 'hello');

      expect(result).toEqual({ messageId: 'wamid.1' });
      expect(fetchMock).toHaveBeenCalledWith(
        `https://graph.facebook.com/${GRAPH_VERSION}/pnid-1/messages`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-1',
          }),
        }),
      );
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '+923001234567',
        type: 'text',
        text: { body: 'hello' },
      });
    });

    it('never touches the network without a token', async () => {
      const error = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.sendText(
          { ...connection, accessTokenCiphertext: null },
          '+923001234567',
          'hello',
        ),
      ).rejects.toBeInstanceOf(WhatsappSendError);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
    });

    it('throws with the Graph code on a payment failure (131042)', async () => {
      const error = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(
        graphError(400, 131042, 'Business eligibility payment issue'),
      );

      await expect(
        service.sendText(connection, '+923001234567', 'hello'),
      ).rejects.toMatchObject({ status: 400, graphCode: 131042 });

      expect(error.mock.calls[0][0]).toContain('131042');
      expect(connections.update).not.toHaveBeenCalled();
    });

    it('marks a Graph 131047 as a closed reply window without flagging', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(
        graphError(400, 131047, 'Re-engagement message'),
      );

      const err = (await service
        .sendText(connection, '+923001234567', 'hello')
        .catch((e: unknown) => e)) as WhatsappSendError;

      expect(err).toBeInstanceOf(WhatsappSendError);
      expect(err.graphCode).toBe(131047);
      expect(err.windowClosed).toBe(true);
      expect(err.needsReconnect).toBeFalsy();
      expect(connections.update).not.toHaveBeenCalled();
    });

    it('does not read other Graph failures as a closed window', () => {
      expect(
        new WhatsappSendError('Cloud API send failed 400', 400, 131042)
          .windowClosed,
      ).toBe(false);
      expect(new WhatsappSendError('Cloud API send error').windowClosed).toBe(
        false,
      );
    });

    it('throws and flags the connection on a 401', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(
        graphError(401, 190, 'Error validating access token'),
      );

      await expect(
        service.sendText(connection, '+923001234567', 'hello'),
      ).rejects.toBeInstanceOf(WhatsappSendError);

      expect(connections.update).toHaveBeenCalledWith(
        { id: 'conn-1', status: Not('flagged') },
        { status: 'flagged', disconnectReason: 'token_invalid_190' },
      );
      expect(gateway.emitConnection).toHaveBeenCalledWith('user-1', {
        status: 'flagged',
      });
    });

    it('does not push a connection update when the row was already flagged', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      connections.update.mockResolvedValue({ affected: 0 });
      fetchMock.mockResolvedValue(
        graphError(401, 190, 'Error validating access token'),
      );

      await expect(
        service.sendText(connection, '+923001234567', 'hello'),
      ).rejects.toBeInstanceOf(WhatsappSendError);

      expect(gateway.emitConnection).not.toHaveBeenCalled();
    });

    it('still rejects with the send error when the connection push fails', async () => {
      const error = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      gateway.emitConnection.mockImplementation(() => {
        throw new Error('socket down');
      });
      fetchMock.mockResolvedValue(
        graphError(401, 190, 'Error validating access token'),
      );

      await expect(
        service.sendText(connection, '+923001234567', 'hello'),
      ).rejects.toBeInstanceOf(WhatsappSendError);

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to push connection status'),
        expect.stringContaining('socket down'),
      );
    });

    it('does not flag the connection on a 500', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '{"error":{"message":"internal","code":1}}',
      });

      await expect(
        service.sendText(connection, '+923001234567', 'hello'),
      ).rejects.toBeInstanceOf(WhatsappSendError);

      expect(connections.update).not.toHaveBeenCalled();
    });

    it('throws when the request times out', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      const aborted = new Error('This operation was aborted');
      aborted.name = 'AbortError';
      fetchMock.mockRejectedValue(aborted);

      await expect(
        service.sendText(connection, '+923001234567', 'hello'),
      ).rejects.toBeInstanceOf(WhatsappSendError);
    });

    it('falls back to the default timeout when the env value is not finite', async () => {
      process.env.WHATSAPP_SEND_TIMEOUT_MS = 'not-a-number';
      let abortedInFlight: boolean | null = null;
      fetchMock.mockImplementation(async (_url: string, init: any) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        abortedInFlight = (init.signal as AbortSignal).aborted;
        return {
          ok: true,
          json: async () => ({ messages: [{ id: 'wamid.9' }] }),
        };
      });

      const result = await service.sendText(
        connection,
        '+923001234567',
        'hello',
      );

      // NaN would have aborted at 1ms; the guard keeps the 15s default alive.
      expect(abortedInFlight).toBe(false);
      expect(result).toEqual({ messageId: 'wamid.9' });
    });
  });

  describe('markRead', () => {
    it('rides the typing indicator on the read receipt when asked', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      await service.markRead(connection, 'wamid.in1', true);

      expect(fetchMock).toHaveBeenCalledWith(
        `https://graph.facebook.com/${GRAPH_VERSION}/pnid-1/messages`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-1',
          }),
        }),
      );
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: 'wamid.in1',
        typing_indicator: { type: 'text' },
      });
    });

    it('omits the typing indicator on a plain read receipt', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      await service.markRead(connection, 'wamid.in2', false);

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: 'wamid.in2',
      });
    });

    it('never touches the network without a token', async () => {
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        service.markRead(
          { ...connection, accessTokenCiphertext: null },
          'wamid.in3',
          true,
        ),
      ).resolves.toBeUndefined();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    });

    it('swallows and logs a Graph rejection instead of throwing', async () => {
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(
        graphError(400, 131009, 'Invalid message id'),
      );

      await expect(
        service.markRead(connection, 'wamid.gone', true),
      ).resolves.toBeUndefined();

      expect(warn.mock.calls[0][0]).toContain('131009');
    });

    it('swallows and logs a transport error instead of throwing', async () => {
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);
      fetchMock.mockRejectedValue(new Error('fetch failed'));

      await expect(
        service.markRead(connection, 'wamid.in4', true),
      ).resolves.toBeUndefined();

      expect(warn.mock.calls[0][0]).toContain('fetch failed');
    });
  });

  describe('markReadFor', () => {
    it('resolves the caller own connected number and rides typing on it', async () => {
      connections.findOne.mockResolvedValue(connection);
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      await service.markReadFor('company-1', 'user-1')('wamid.in5', true);

      expect(connections.findOne).toHaveBeenCalledWith({
        where: { companyId: 'company-1', userId: 'user-1', status: 'connected' },
      });
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body).typing_indicator).toEqual({ type: 'text' });
    });

    it('is a silent no-op when the user has no connected number', async () => {
      connections.findOne.mockResolvedValue(null);

      await expect(
        service.markReadFor('company-1', 'user-1')('wamid.in6', true),
      ).resolves.toBeUndefined();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('senderFor', () => {
    it('throws instead of dropping when the user has no connected number', async () => {
      connections.findOne.mockResolvedValue(null);
      const error = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.senderFor('company-1', 'user-1')('+923001234567', 'hi'),
      ).rejects.toBeInstanceOf(WhatsappSendError);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
    });

    it('does not persist or push an outbound row when the send fails', async () => {
      connections.findOne.mockResolvedValue(connection);
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(
        graphError(400, 131042, 'Business eligibility payment issue'),
      );

      await expect(
        service.senderFor('company-1', 'user-1')('+923001234567', 'hi'),
      ).rejects.toBeInstanceOf(WhatsappSendError);

      expect(store.addMessage).not.toHaveBeenCalled();
      expect(gateway.emitMessage).not.toHaveBeenCalled();
    });

    it('sends, persists the outbound row, and pushes it to the operator', async () => {
      connections.findOne.mockResolvedValue(connection);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.2' }] }),
      });

      const result = await service
        .senderFor('company-1', 'user-1')('+923001234567', 'the rent is due friday');

      expect(result).toEqual({ messageId: 'wamid.2' });
      expect(connections.findOne).toHaveBeenCalledWith({
        where: { companyId: 'company-1', userId: 'user-1', status: 'connected' },
      });
      // The AI row carries the same phone_number_id the operator path already stamps.
      expect(store.addMessage).toHaveBeenCalledWith(
        'company-1',
        'user-1',
        expect.objectContaining({
          id: 'wamid.2',
          chatId: '+923001234567',
          fromMe: true,
          aiGenerated: true,
        }),
        'pnid-1',
      );
      expect(gateway.emitMessage).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ id: 'wamid.2' }),
      );
    });

    it('waits for the outbound row before returning, so a fast sent callback finds it', async () => {
      connections.findOne.mockResolvedValue(connection);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.4' }] }),
      });
      let committed = false;
      store.addMessage.mockImplementation(
        () =>
          new Promise<void>((resolve) =>
            setImmediate(() => {
              committed = true;
              resolve();
            }),
          ),
      );

      await service.senderFor('company-1', 'user-1')('+923001234567', 'awaited reply');

      expect(committed).toBe(true);
      expect(
        store.addMessage.mock.invocationCallOrder[0],
      ).toBeLessThan(gateway.emitMessage.mock.invocationCallOrder[0]);
    });

    it('refreshes the credit counters only when a window was charged', async () => {
      connections.findOne.mockResolvedValue(connection);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.3' }] }),
      });
      ai.getCreditUsage.mockResolvedValue({
        used: 3,
        limit: 200,
        openWindows: 1,
      });

      await service
        .senderFor('company-1', 'user-1')('+923001234567', 'charged reply', {
          creditCharged: true,
        });
      await flushAsync();

      expect(gateway.emitAi).toHaveBeenCalledWith('user-1', {
        creditsUsed: 3,
        creditsLimit: 200,
        openWindows: 1,
      });

      await service
        .senderFor('company-1', 'user-1')('+923001234567', 'reused reply', {
          creditCharged: false,
        });
      await flushAsync();

      expect(gateway.emitAi).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMedia', () => {
    it('asks Graph for the media with the bearer token and the phone number id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          url: 'https://lookaside.example/media',
          file_size: '2048',
          mime_type: 'image/jpeg',
          sha256: 'abc=',
          id: 'media-1',
        }),
      });

      const info = await service.getMedia(connection, 'token-1', 'media-1');

      expect(info).toEqual({
        url: 'https://lookaside.example/media',
        file_size: 2048,
        mime_type: 'image/jpeg',
        sha256: 'abc=',
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        `https://graph.facebook.com/${GRAPH_VERSION}/media-1?phone_number_id=pnid-1`,
      );
      expect(init.headers).toEqual({ Authorization: 'Bearer token-1' });
      expect(init.signal).toBeDefined();
    });

    it('reports an unknown media id (code 100, subcode 33) as gone', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({ error: { code: 100, error_subcode: 33 } }),
      });

      const err = await service
        .getMedia(connection, 'token-1', 'media-1')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(WhatsappMediaFetchError);
      expect((err as WhatsappMediaFetchError).isMediaGone).toBe(true);
    });

    it('reports a 404 as gone', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '',
      });

      const err = await service
        .getMedia(connection, 'token-1', 'media-1')
        .catch((e: unknown) => e);

      expect((err as WhatsappMediaFetchError).isMediaGone).toBe(true);
    });

    it('treats any other Graph failure as retryable', async () => {
      fetchMock.mockResolvedValue(graphError(500, 2, 'temporary'));

      const err = await service
        .getMedia(connection, 'token-1', 'media-1')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(WhatsappMediaFetchError);
      expect((err as WhatsappMediaFetchError).isMediaGone).toBe(false);
    });

    it('flags the connection on a 401 and throws a retryable error', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(
        graphError(401, 190, 'Error validating access token'),
      );

      const err = await service
        .getMedia(connection, 'token-1', 'media-1')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(WhatsappMediaFetchError);
      expect((err as WhatsappMediaFetchError).isMediaGone).toBe(false);
      expect((err as WhatsappMediaFetchError).graphCode).toBe(190);
      expect(connections.update).toHaveBeenCalledWith(
        { id: 'conn-1', status: Not('flagged') },
        { status: 'flagged', disconnectReason: 'token_invalid_190' },
      );
    });

    it('flags the connection on code 190 even without a 401 status', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(graphError(400, 190, 'Token expired'));

      await service
        .getMedia(connection, 'token-1', 'media-1')
        .catch(() => undefined);

      expect(connections.update).toHaveBeenCalled();
    });

    it('does not flag the connection on other Graph failures', async () => {
      fetchMock.mockResolvedValue(graphError(500, 2, 'temporary'));

      await service
        .getMedia(connection, 'token-1', 'media-1')
        .catch(() => undefined);

      expect(connections.update).not.toHaveBeenCalled();
    });

    it('rejects a response without a url', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await expect(
        service.getMedia(connection, 'token-1', 'media-1'),
      ).rejects.toThrow('no url');
    });
  });

  describe('openMediaDownload', () => {
    it('streams the url with the bearer token and the caller signal', async () => {
      const res = { ok: true, status: 200, body: {} };
      fetchMock.mockResolvedValue(res);
      const controller = new AbortController();

      await expect(
        service.openMediaDownload(
          'token-1',
          'https://lookaside.example/media',
          controller.signal,
        ),
      ).resolves.toBe(res);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://lookaside.example/media',
        {
          headers: { Authorization: 'Bearer token-1' },
          signal: controller.signal,
        },
      );
    });

    it('throws a retryable error and releases the body on a failed download', async () => {
      const cancel = jest.fn().mockResolvedValue(undefined);
      fetchMock.mockResolvedValue({ ok: false, status: 401, body: { cancel } });

      const err = await service
        .openMediaDownload('token-1', 'https://lookaside.example/media')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(WhatsappMediaFetchError);
      expect((err as WhatsappMediaFetchError).isMediaGone).toBe(false);
      expect(cancel).toHaveBeenCalled();
    });
  });
  describe('uploadMedia', () => {
    let dir: string;
    let path: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'wa-cloud-spec-'));
      path = join(dir, 'upload');
      await writeFile(path, 'jpeg bytes');
    });

    afterEach(() => {
      delete process.env.WHATSAPP_MEDIA_UPLOAD_TIMEOUT_MS;
    });

    it('posts the file as multipart with the product, type and file name, and returns the media id', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ id: 'media-1' }), { status: 200 }),
      );

      const id = await service.uploadMedia(connection, 'token-1', {
        path,
        mime: 'image/jpeg',
        fileName: 'photo.jpg',
      });

      expect(id).toBe('media-1');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        `https://graph.facebook.com/${GRAPH_VERSION}/pnid-1/media`,
      );
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Authorization: 'Bearer token-1' });
      const form = init.body as FormData;
      expect(form.get('messaging_product')).toBe('whatsapp');
      expect(form.get('type')).toBe('image/jpeg');
      const file = form.get('file') as File;
      expect(file.name).toBe('photo.jpg');
      expect(file.type).toBe('image/jpeg');
      expect(await file.text()).toBe('jpeg bytes');
    });

    it('aborts on its own timeout, not the send timeout', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      process.env.WHATSAPP_SEND_TIMEOUT_MS = '1';
      process.env.WHATSAPP_MEDIA_UPLOAD_TIMEOUT_MS = '30';
      let abortedAt5ms: boolean | null = null;
      fetchMock.mockImplementation(async (_url: string, init: any) => {
        const signal = init.signal as AbortSignal;
        await new Promise((resolve) => setTimeout(resolve, 5));
        abortedAt5ms = signal.aborted;
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (signal.aborted) throw new Error('This operation was aborted');
        return new Response(JSON.stringify({ id: 'media-1' }), {
          status: 200,
        });
      });

      await expect(
        service.uploadMedia(connection, 'token-1', {
          path,
          mime: 'image/jpeg',
          fileName: 'photo.jpg',
        }),
      ).rejects.toBeInstanceOf(WhatsappSendError);
      expect(abortedAt5ms).toBe(false);
    });

    it('flags the connection on code 190 and throws a send error with the Graph code', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(
        graphError(400, 190, 'Error validating access token'),
      );

      await expect(
        service.uploadMedia(connection, 'token-1', {
          path,
          mime: 'image/jpeg',
          fileName: 'photo.jpg',
        }),
      ).rejects.toMatchObject({ status: 400, graphCode: 190 });
      expect(connections.update).toHaveBeenCalledWith(
        { id: 'conn-1', status: Not('flagged') },
        { status: 'flagged', disconnectReason: 'token_invalid_190' },
      );
    });

    it('throws when Meta returns no media id', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

      await expect(
        service.uploadMedia(connection, 'token-1', {
          path,
          mime: 'image/jpeg',
          fileName: 'photo.jpg',
        }),
      ).rejects.toThrow('no media id');
    });
  });

  describe('sendMedia', () => {
    const sent = () =>
      JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<
        string,
        unknown
      >;

    beforeEach(() => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.m1' }] }),
      });
    });

    it('sends an image with its caption', async () => {
      await expect(
        service.sendMedia(connection, '971501234567', {
          type: 'image',
          mediaId: 'media-1',
          caption: 'Front door',
          fileName: 'image-1.jpg',
        }),
      ).resolves.toEqual({ messageId: 'wamid.m1' });
      expect(sent()).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '971501234567',
        type: 'image',
        image: { id: 'media-1', caption: 'Front door' },
      });
    });

    it('sends a document with its caption and file name', async () => {
      await service.sendMedia(connection, '971501234567', {
        type: 'document',
        mediaId: 'media-1',
        caption: 'Lease',
        fileName: 'lease.pdf',
      });
      expect(sent()).toMatchObject({
        type: 'document',
        document: { id: 'media-1', caption: 'Lease', filename: 'lease.pdf' },
      });
    });

    it('sends a voice note as audio with voice set, never a caption', async () => {
      await service.sendMedia(connection, '971501234567', {
        type: 'audio',
        mediaId: 'media-1',
        caption: 'ignored',
        voice: true,
      });
      expect(sent()).toMatchObject({
        type: 'audio',
        audio: { id: 'media-1', voice: true },
      });
    });

    it('sends a video with a caption and a sticker with only its id', async () => {
      await service.sendMedia(connection, '971501234567', {
        type: 'video',
        mediaId: 'media-1',
        caption: 'Tour',
      });
      expect(sent()).toMatchObject({
        type: 'video',
        video: { id: 'media-1', caption: 'Tour' },
      });

      fetchMock.mockClear();
      await service.sendMedia(connection, '971501234567', {
        type: 'sticker',
        mediaId: 'media-2',
        caption: 'ignored',
        fileName: 'sticker.webp',
      });
      expect(sent()).toMatchObject({
        type: 'sticker',
        sticker: { id: 'media-2' },
      });
    });

    it('maps a closed window like the text send', async () => {
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValue(
        graphError(400, 131047, 'Re-engagement message'),
      );

      const err = (await service
        .sendMedia(connection, '971501234567', {
          type: 'image',
          mediaId: 'media-1',
        })
        .catch((e: unknown) => e)) as WhatsappSendError;
      expect(err.windowClosed).toBe(true);
    });
  });
});
