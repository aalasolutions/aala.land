import { randomBytes } from 'crypto';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Not, QueryFailedError } from 'typeorm';
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

// Shapes a fake QueryFailedError to exercise connect's 23505 unique-violation mapping.
const makeUniqueViolation = (driverError: {
  code?: string;
  constraint?: string;
}): QueryFailedError => {
  const err = new QueryFailedError('query', [], driverError as unknown as Error);
  (err as unknown as { driverError: unknown }).driverError = driverError;
  return err;
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
    count: jest.Mock;
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
      count: jest.fn().mockResolvedValue(0),
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

  const phoneListing = ok({
    data: [
      { id: '999999999', display_phone_number: '+971 50 111 1111' },
      { id: dto.phoneNumberId, display_phone_number: '+971 50 000 0000' },
    ],
  });

  // Order matters: exchange, read, subscribe, then store, since the code expires in 30 seconds.
  const happyPathFetches = () => {
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: TOKEN }))
      .mockResolvedValueOnce(phoneListing)
      .mockResolvedValueOnce(ok({ success: true }));
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
        `https://graph.facebook.com/${GRAPH_VERSION}/${dto.wabaId}/phone_numbers`,
      );
      expect(String(fetchMock.mock.calls[2][0])).toBe(
        `https://graph.facebook.com/${GRAPH_VERSION}/${dto.wabaId}/subscribed_apps`,
      );
      expect(fetchMock.mock.calls[2][1].method).toBe('POST');
      expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe(
        `Bearer ${TOKEN}`,
      );

      const saved = connections.insert.mock.calls[0][0];
      expect(saved.status).toBe(WhatsappConnectionStatus.CONNECTED);
      expect(saved.userId).toBe('user-1');
      expect(saved.companyId).toBe('company-1');
      expect(saved.phoneNumberId).toBe(dto.phoneNumberId);
      expect(saved.displayPhoneNumber).toBe('+971 50 000 0000');
      expect(saved.accessTokenCiphertext).not.toContain(TOKEN);
      expect(encryption.decrypt(saved.accessTokenCiphertext)).toBe(TOKEN);
      expect(saved.lifecycleEventAt).toBeInstanceOf(Date);
      expect(saved.lifecycleEventAt).toEqual(saved.connectedAt);

      expect(result).toBe(connectedInfo);
    });

    // Meta errors on /register for Coexistence numbers already registered; this call must never fire.
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
      // Refuses a retried or late Meta lifecycle event from before this reconnect.
      expect(patch.lifecycleEventAt).toBeInstanceOf(Date);
      expect(patch.lifecycleEventAt).toEqual(patch.connectedAt);
    });

    it('refuses a phone number already connected to another user', async () => {
      connections.findOne.mockResolvedValueOnce({ id: 'someone-else' });

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // Only CONNECTED/FLAGGED rows hold a number, so seat removal frees it for a replacement agent.
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

    // The `taken` pre-check is read-then-write; concurrent connects can still collide at the unique index.
    it('maps a unique violation on the phone number index to a 409', async () => {
      happyPathFetches();
      connections.insert.mockRejectedValueOnce(
        makeUniqueViolation({
          code: '23505',
          constraint: 'UQ_wa_connections_phone_number_id',
        }),
      );

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps a unique violation on the user index to a 409', async () => {
      happyPathFetches();
      connections.insert.mockRejectedValueOnce(
        makeUniqueViolation({
          code: '23505',
          constraint: 'UQ_wa_connections_user',
        }),
      );

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows a DB error that is not the mapped unique violation', async () => {
      happyPathFetches();
      const dbError = makeUniqueViolation({ code: '55000' });
      connections.insert.mockRejectedValueOnce(dbError);

      await expect(service.connect('user-1', 'company-1', dto)).rejects.toBe(
        dbError,
      );
    });

    it('maps a unique violation on the update branch to a 409 too', async () => {
      connections.findOne
        .mockResolvedValueOnce(null) // no other user holds the number
        .mockResolvedValueOnce({ id: 'existing-1' });
      happyPathFetches();
      connections.update.mockRejectedValueOnce(
        makeUniqueViolation({
          code: '23505',
          constraint: 'UQ_wa_connections_user',
        }),
      );

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(ConflictException);
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

    // A failed subscription must not leave a connection that looks healthy but never receives webhooks.
    it('stores nothing when the app subscription fails', async () => {
      fetchMock
        .mockResolvedValueOnce(ok({ access_token: TOKEN }))
        .mockResolvedValueOnce(phoneListing)
        .mockResolvedValueOnce(fail(403, 'not authorised'));

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(connections.insert).not.toHaveBeenCalled();
    });

    // Caller-supplied routing key must not let one caller hijack another business's phone number.
    it('refuses a phone number that is not on the connected WABA', async () => {
      fetchMock
        .mockResolvedValueOnce(ok({ access_token: TOKEN }))
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
      // A rejected number must not leave the WABA subscribed with no row to undo it.
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.endsWith('/subscribed_apps'))).toBe(false);
    });

    it('stores nothing when the phone number listing cannot be read', async () => {
      fetchMock
        .mockResolvedValueOnce(ok({ access_token: TOKEN }))
        .mockResolvedValueOnce(fail(500, 'graph down'));

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(connections.insert).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // success:false must not be stored as a live connection that silently receives nothing.
    it('refuses a subscription that Meta does not confirm', async () => {
      fetchMock
        .mockResolvedValueOnce(ok({ access_token: TOKEN }))
        .mockResolvedValueOnce(phoneListing)
        .mockResolvedValueOnce(ok({ success: false }));

      await expect(
        service.connect('user-1', 'company-1', dto),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(connections.insert).not.toHaveBeenCalled();
    });

    // Encryption key must be validated before the code is spent and the WABA is subscribed.
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

  describe('connect to a different WABA', () => {
    const OLD_WABA = 'old-waba-777';
    const OLD_TOKEN = 'EAAoldBusinessIntegrationToken';

    const existingRow = (wabaId: string, ciphertext: string | null) => {
      connections.findOne
        .mockResolvedValueOnce(null) // no other user holds the number
        .mockResolvedValueOnce({
          id: 'existing-1',
          wabaId,
          accessTokenCiphertext: ciphertext,
        });
    };

    const deleteCalls = () =>
      fetchMock.mock.calls.filter((c) => c[1]?.method === 'DELETE');

    it('unsubscribes the old WABA with the old token after the row is rewritten', async () => {
      existingRow(OLD_WABA, encryption.encrypt(OLD_TOKEN));
      happyPathFetches();
      fetchMock.mockResolvedValueOnce(ok({ success: true }));

      await expect(service.connect('user-1', 'company-1', dto)).resolves.toBe(
        connectedInfo,
      );

      const deletes = deleteCalls();
      expect(deletes).toHaveLength(1);
      expect(String(deletes[0][0])).toBe(
        `https://graph.facebook.com/${GRAPH_VERSION}/${OLD_WABA}/subscribed_apps`,
      );
      expect(deletes[0][1].headers.Authorization).toBe(`Bearer ${OLD_TOKEN}`);
      expect(connections.update.mock.invocationCallOrder[0]).toBeLessThan(
        fetchMock.mock.invocationCallOrder[3],
      );
      expect(connections.count.mock.calls[0][0].where).toEqual([
        {
          wabaId: OLD_WABA,
          id: Not('existing-1'),
          status: WhatsappConnectionStatus.CONNECTED,
        },
        {
          wabaId: OLD_WABA,
          id: Not('existing-1'),
          status: WhatsappConnectionStatus.FLAGGED,
        },
      ]);
    });

    it('does not unsubscribe when only the number changes on the same WABA', async () => {
      existingRow(dto.wabaId, encryption.encrypt(OLD_TOKEN));
      happyPathFetches();

      await service.connect('user-1', 'company-1', dto);

      expect(deleteCalls()).toHaveLength(0);
      expect(connections.count).not.toHaveBeenCalled();
    });

    it('does not unsubscribe while another live row remains on the old WABA', async () => {
      existingRow(OLD_WABA, encryption.encrypt(OLD_TOKEN));
      happyPathFetches();
      connections.count.mockResolvedValue(1);

      await service.connect('user-1', 'company-1', dto);

      expect(deleteCalls()).toHaveLength(0);
    });

    it('still connects when Meta refuses the old unsubscribe', async () => {
      existingRow(OLD_WABA, encryption.encrypt(OLD_TOKEN));
      happyPathFetches();
      fetchMock.mockResolvedValueOnce(fail(500, 'graph down'));
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);

      await expect(service.connect('user-1', 'company-1', dto)).resolves.toBe(
        connectedInfo,
      );
      expect(warn).toHaveBeenCalled();
    });

    it('still connects and warns when the old token cannot be decrypted', async () => {
      existingRow(OLD_WABA, 'v1.not.a.valid-payload');
      happyPathFetches();
      jest
        .spyOn(encryption['logger'], 'error')
        .mockImplementation(() => undefined);
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);

      await expect(service.connect('user-1', 'company-1', dto)).resolves.toBe(
        connectedInfo,
      );
      expect(deleteCalls()).toHaveLength(0);
      expect(warn).toHaveBeenCalled();
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
      expect(patch.disconnectReason).toBe('SELF_DISCONNECTED');
    });

    it('records the caller reason when a removed seat is disconnected', async () => {
      connections.findOne.mockResolvedValue({
        id: 'conn-1',
        wabaId: dto.wabaId,
        accessTokenCiphertext: encryption.encrypt(TOKEN),
      });
      fetchMock.mockResolvedValueOnce(ok({ success: true }));

      await service.disconnect('user-1', 'company-1', 'SEAT_REMOVED');

      expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
      const patch = connections.update.mock.calls[0][1];
      expect(patch.disconnectReason).toBe('SEAT_REMOVED');
    });

    it('still disconnects locally when reading the connection row fails', async () => {
      connections.findOne.mockRejectedValue(new Error('db timeout'));
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);

      await expect(
        service.disconnect('user-1', 'company-1', 'SEAT_REMOVED'),
      ).resolves.toEqual({ success: true });

      expect(wa.disconnect).toHaveBeenCalledWith('user-1', 'company-1');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    });

    // wa.disconnect flips the row before the Graph DELETE, so no in-flight turn sees it CONNECTED.
    it('flips the row via wa.disconnect before calling Meta to unsubscribe', async () => {
      connections.findOne.mockResolvedValue({
        id: 'conn-1',
        wabaId: dto.wabaId,
        accessTokenCiphertext: encryption.encrypt(TOKEN),
      });
      fetchMock.mockResolvedValueOnce(ok({ success: true }));

      await service.disconnect('user-1', 'company-1');

      const waDisconnectOrder = wa.disconnect.mock.invocationCallOrder[0];
      const deleteCallOrder = fetchMock.mock.invocationCallOrder[0];
      expect(waDisconnectOrder).toBeLessThan(deleteCallOrder);
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

    // A WABA's subscription is shared, so unsubscribing must skip while a sibling connection is live.
    it('skips the Meta unsubscribe when another live connection shares the WABA', async () => {
      connections.findOne.mockResolvedValue({
        id: 'conn-1',
        wabaId: dto.wabaId,
        accessTokenCiphertext: encryption.encrypt(TOKEN),
      });
      connections.count.mockResolvedValue(1);

      await expect(service.disconnect('user-1', 'company-1')).resolves.toEqual({
        success: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(wa.disconnect).toHaveBeenCalledWith('user-1', 'company-1');
      const patch = connections.update.mock.calls[0][1];
      expect(patch.disconnectReason).toBe('SELF_DISCONNECTED');
    });

    it('counts siblings on the same WABA excluding the disconnecting row, filtered to CONNECTED/FLAGGED', async () => {
      connections.findOne.mockResolvedValue({
        id: 'conn-1',
        wabaId: dto.wabaId,
        accessTokenCiphertext: encryption.encrypt(TOKEN),
      });
      fetchMock.mockResolvedValueOnce(ok({ success: true }));

      await service.disconnect('user-1', 'company-1');

      const countArgs = connections.count.mock.calls[0][0];
      expect(countArgs.where).toEqual([
        {
          wabaId: dto.wabaId,
          id: Not('conn-1'),
          status: WhatsappConnectionStatus.CONNECTED,
        },
        {
          wabaId: dto.wabaId,
          id: Not('conn-1'),
          status: WhatsappConnectionStatus.FLAGGED,
        },
      ]);
    });
  });
});
