import { randomBytes } from 'crypto';
import {
  WhatsappCloudApiService,
  WhatsappSendError,
} from './whatsapp-cloud-api.service';
import { WhatsappConnection } from './entities/whatsapp-connection.entity';
import { EncryptionService } from '../encryption/encryption.service';

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
  let gateway: { emitMessage: jest.Mock; emitAi: jest.Mock };
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
    gateway = { emitMessage: jest.fn(), emitAi: jest.fn() };
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
        'https://graph.facebook.com/v23.0/pnid-1/messages',
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
        { id: 'conn-1' },
        { status: 'flagged', disconnectReason: 'token_invalid_190' },
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
        'https://graph.facebook.com/v23.0/pnid-1/messages',
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

      await service.markReadFor('user-1')('wamid.in5', true);

      expect(connections.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: 'connected' },
      });
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body).typing_indicator).toEqual({ type: 'text' });
    });

    it('is a silent no-op when the user has no connected number', async () => {
      connections.findOne.mockResolvedValue(null);

      await expect(
        service.markReadFor('user-1')('wamid.in6', true),
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
        service.senderFor('user-1')('+923001234567', 'hi'),
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
        service.senderFor('user-1')('+923001234567', 'hi'),
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
        .senderFor('user-1')('+923001234567', 'the rent is due friday');

      expect(result).toEqual({ messageId: 'wamid.2' });
      expect(connections.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: 'connected' },
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

      await service.senderFor('user-1')('+923001234567', 'awaited reply');

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
        .senderFor('user-1')('+923001234567', 'charged reply', {
          creditCharged: true,
        });
      await flushAsync();

      expect(gateway.emitAi).toHaveBeenCalledWith('user-1', {
        creditsUsed: 3,
        creditsLimit: 200,
        openWindows: 1,
      });

      await service
        .senderFor('user-1')('+923001234567', 'reused reply', {
          creditCharged: false,
        });
      await flushAsync();

      expect(gateway.emitAi).toHaveBeenCalledTimes(1);
    });
  });
});
