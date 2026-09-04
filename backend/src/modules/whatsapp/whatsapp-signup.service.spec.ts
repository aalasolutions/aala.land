import { randomBytes } from 'crypto';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WhatsappSignupService } from './whatsapp-signup.service';
import { WhatsappConnectionStatus } from './entities/whatsapp-connection.entity';
import { EncryptionService } from '../encryption/encryption.service';
import { GRAPH_VERSION } from './wa-types';

const KEY_ENV = 'WHATSAPP_TOKEN_ENC_KEY';

const CODE = 'AQBsuperSecretExchangeCode';
const TOKEN = 'EAAsuperSecretBusinessIntegrationToken';

const dto = {
  code: CODE,
  wabaId: '111222333',
  phoneNumberId: '444555666',
};

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const fail = (status: number, message: string) => ({
  ok: false,
  status,
  json: async () => ({ error: { message } }),
  text: async () => JSON.stringify({ error: { message } }),
});

describe('WhatsappSignupService', () => {
  let service: WhatsappSignupService;
  let connections: {
    findOne: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };
  let wa: { getConnection: jest.Mock; disconnect: jest.Mock };
  let encryption: EncryptionService;
  let fetchMock: jest.Mock;
  const savedEnv: Record<string, string | undefined> = {};

  const connectedInfo = {
    status: WhatsappConnectionStatus.CONNECTED,
    displayPhoneNumber: '+971 50 000 0000',
    connectedAt: '2026-09-01T00:00:00.000Z',
    disconnectedAt: null,
    disconnectReason: null,
  };

  beforeEach(() => {
    for (const key of [
      KEY_ENV,
      'WHATSAPP_APP_ID',
      'WHATSAPP_APP_SECRET',
      'WHATSAPP_ES_CONFIG_ID',
    ]) {
      savedEnv[key] = process.env[key];
    }
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    process.env.WHATSAPP_APP_ID = 'app-id-1';
    process.env.WHATSAPP_APP_SECRET = 'app-secret-1';
    process.env.WHATSAPP_ES_CONFIG_ID = 'config-id-1';

    encryption = new EncryptionService();
    connections = {
      findOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 'c1' }] }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    wa = {
      getConnection: jest.fn().mockResolvedValue(connectedInfo),
      disconnect: jest.fn().mockResolvedValue({ success: true }),
    };
    fetchMock = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as any);

    service = new WhatsappSignupService(
      connections as any,
      encryption,
      wa as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // The happy path: exchange, subscribe, read the number, store. In that order, because
  // the code dies in 30 seconds and nothing is stored for a WABA we cannot receive from.
  const happyPathFetches = () => {
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: TOKEN }))
      .mockResolvedValueOnce(ok({ success: true }))
      .mockResolvedValueOnce(
        ok({
          data: [
            { id: '999999999', display_phone_number: '+971 50 111 1111' },
            { id: dto.phoneNumberId, display_phone_number: '+971 50 000 0000' },
          ],
        }),
      );
  };

  describe('getSignupConfig', () => {
    it('serves the app id, config id and the pinned Graph version', () => {
      expect(service.getSignupConfig()).toEqual({
        appId: 'app-id-1',
        configId: 'config-id-1',
        graphVersion: GRAPH_VERSION,
      });
    });

    it('reports null rather than an empty string when unset, so the UI can stay disabled', () => {
      delete process.env.WHATSAPP_APP_ID;
      process.env.WHATSAPP_ES_CONFIG_ID = '   ';

      expect(service.getSignupConfig()).toEqual({
        appId: null,
        configId: null,
        graphVersion: GRAPH_VERSION,
      });
    });
  });

  describe('connect', () => {
    it('exchanges the code, subscribes the app, and stores an ENCRYPTED token', async () => {
      happyPathFetches();

      const result = await service.connect('user-1', 'company-1', dto);

      const exchangeUrl = String(fetchMock.mock.calls[0][0]);
      expect(exchangeUrl).toContain(
        `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
      );
      expect(exchangeUrl).toContain(`code=${CODE}`);

      expect(String(fetchMock.mock.calls[1][0])).toBe(
        `https://graph.facebook.com/${GRAPH_VERSION}/${dto.wabaId}/subscribed_apps`,
      );
      expect(String(fetchMock.mock.calls[2][0])).toBe(
        `https://graph.facebook.com/${GRAPH_VERSION}/${dto.wabaId}/phone_numbers`,
      );
      expect(fetchMock.mock.calls[1][1].method).toBe('POST');
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
        `Bearer ${TOKEN}`,
      );

      const saved = connections.insert.mock.calls[0][0];
      expect(saved.status).toBe(WhatsappConnectionStatus.CONNECTED);
      expect(saved.userId).toBe('user-1');
      expect(saved.companyId).toBe('company-1');
      expect(saved.phoneNumberId).toBe(dto.phoneNumberId);
      expect(saved.displayPhoneNumber).toBe('+971 50 000 0000');
      // The token is never stored in the clear, and the ciphertext round-trips.
      expect(saved.accessTokenCiphertext).not.toContain(TOKEN);
      expect(encryption.decrypt(saved.accessTokenCiphertext)).toBe(TOKEN);

      expect(result).toBe(connectedInfo);
    });

    // Meta instructs partners to skip registration for Coexistence numbers because they
    // are already registered, and the call errors. Guarding it here so a later edit cannot
    // quietly reintroduce it.
    it('never calls POST /{phone-number-id}/register', async () => {
      happyPathFetches();

      await service.connect('user-1', 'company-1', dto);

      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.endsWith('/register'))).toBe(false);
    });

    it('reconnects an existing row instead of inserting a duplicate', async () => {
      connections.findOne
        .mockResolvedValueOnce(null) // no other user holds the number
        .mockResolvedValueOnce({ id: 'existing-1' });
      happyPathFetches();

      await service.connect('user-1', 'company-1', dto);

      expect(connections.insert).not.toHaveBeenCalled();
      const [where, patch] = connections.update.mock.calls[0];
      expect(where).toEqual({ id: 'existing-1' });
      expect(patch.status).toBe(WhatsappConnectionStatus.CONNECTED);
      // A reconnect must clear the old failure, or the card keeps showing a stale reason.
      expect(patch.disconnectedAt).toBeNull();
      expect(patch.disconnectReason).toBeNull();
    });

    it('refuses a phone number already connected to another user', async () => {
      connections.findOne.mockResolvedValueOnce({ id: 'someone-else' });

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // A departed agent's row must not lock the number. Seat removal disconnects them, and
    // their replacement has to be able to connect the same company number.
    it('only treats CONNECTED or FLAGGED rows as holding a number', async () => {
      happyPathFetches();

      await service.connect('user-1', 'company-1', dto);

      const where = connections.findOne.mock.calls[0][0].where;
      expect(where).toEqual([
        expect.objectContaining({
          status: WhatsappConnectionStatus.CONNECTED,
        }),
        expect.objectContaining({ status: WhatsappConnectionStatus.FLAGGED }),
      ]);
      expect(connections.insert).toHaveBeenCalled();
    });

    it('fails closed when the app credentials are not configured', async () => {
      delete process.env.WHATSAPP_APP_SECRET;

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('stores nothing when the exchange fails', async () => {
      fetchMock.mockResolvedValueOnce(fail(400, 'code expired'));

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(connections.insert).not.toHaveBeenCalled();
      expect(connections.update).not.toHaveBeenCalled();
    });

    // A connection we cannot receive webhooks for looks healthy and silently never
    // delivers a message, which is worse than a visible failure.
    it('stores nothing when the app subscription fails', async () => {
      fetchMock
        .mockResolvedValueOnce(ok({ access_token: TOKEN }))
        .mockResolvedValueOnce(fail(403, 'not authorised'));

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(connections.insert).not.toHaveBeenCalled();
    });

    // The routing key is caller-supplied, so claiming another business's number must be
    // impossible. Without this a caller permanently blocks the real owner from connecting
    // AND receives that number's inbound customer messages.
    it('refuses a phone number that is not on the connected WABA', async () => {
      fetchMock
        .mockResolvedValueOnce(ok({ access_token: TOKEN }))
        .mockResolvedValueOnce(ok({ success: true }))
        .mockResolvedValueOnce(
          ok({
            data: [{ id: 'someone-elses-number', display_phone_number: '+1' }],
          }),
        );

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(connections.insert).not.toHaveBeenCalled();
      expect(connections.update).not.toHaveBeenCalled();
    });

    it('stores nothing when the phone number listing cannot be read', async () => {
      fetchMock
        .mockResolvedValueOnce(ok({ access_token: TOKEN }))
        .mockResolvedValueOnce(ok({ success: true }))
        .mockResolvedValueOnce(fail(500, 'graph down'));

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(connections.insert).not.toHaveBeenCalled();
    });

    // A 200 carrying success:false would otherwise be stored as a live connection that
    // silently receives nothing, which is the exact failure the call ordering prevents.
    it('refuses a subscription that Meta does not confirm', async () => {
      fetchMock
        .mockResolvedValueOnce(ok({ access_token: TOKEN }))
        .mockResolvedValueOnce(ok({ success: false }));

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(connections.insert).not.toHaveBeenCalled();
    });

    // Discovering a bad key at the encrypt call would mean the 30-second code is already
    // burned and our app is already subscribed to the client's WABA.
    it('fails closed on an unusable encryption key BEFORE spending the code', async () => {
      process.env[KEY_ENV] = 'not-a-32-byte-key';

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never writes the code, the app secret or the token into a log', async () => {
      const logged: string[] = [];
      jest
        .spyOn(service['logger'], 'log')
        .mockImplementation((m: any) => logged.push(String(m)));
      jest
        .spyOn(service['logger'], 'error')
        .mockImplementation((m: any) => logged.push(String(m)));
      jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation((m: any) => logged.push(String(m)));

      fetchMock.mockResolvedValueOnce(fail(400, 'code expired'));
      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(BadGatewayException);

      happyPathFetches();
      await service.connect('user-1', 'company-1', dto);

      const all = logged.join('\n');
      expect(all).not.toContain(CODE);
      expect(all).not.toContain(TOKEN);
      expect(all).not.toContain('app-secret-1');
    });
  });

  describe('disconnect', () => {
    it('unsubscribes from Meta, then tears down the row and destroys the token', async () => {
      connections.findOne.mockResolvedValue({
        id: 'conn-1',
        wabaId: dto.wabaId,
        accessTokenCiphertext: encryption.encrypt(TOKEN),
      });
      fetchMock.mockResolvedValueOnce(ok({ success: true }));

      await expect(service.disconnect('user-1', 'company-1')).resolves.toEqual({
        success: true,
      });

      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
      expect(wa.disconnect).toHaveBeenCalledWith('user-1', 'company-1');
      const patch = connections.update.mock.calls[0][1];
      expect(patch.accessTokenCiphertext).toBeNull();
      expect(patch.tokenUpdatedAt).toBeNull();
      expect(patch.disconnectReason).toBe('SELF_DISCONNECTED');
    });

    // Meta refusing must not strand an agent in a connected state they cannot leave.
    it('disconnects locally even when Meta refuses the unsubscribe', async () => {
      connections.findOne.mockResolvedValue({
        id: 'conn-1',
        wabaId: dto.wabaId,
        accessTokenCiphertext: encryption.encrypt(TOKEN),
      });
      fetchMock.mockResolvedValueOnce(fail(403, 'nope'));

      await expect(service.disconnect('user-1', 'company-1')).resolves.toEqual({
        success: true,
      });
      expect(wa.disconnect).toHaveBeenCalled();
      expect(connections.update).toHaveBeenCalled();
    });

    it('is a no-op against Meta when there is nothing connected', async () => {
      connections.findOne.mockResolvedValue(null);

      await service.disconnect('user-1', 'company-1');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(wa.disconnect).toHaveBeenCalledWith('user-1', 'company-1');
    });
  });
});
