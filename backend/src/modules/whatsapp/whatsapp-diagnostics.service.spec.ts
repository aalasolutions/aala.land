import { WhatsappDiagnosticsService } from './whatsapp-diagnostics.service';
import { WhatsappConnectionStatus } from './entities/whatsapp-connection.entity';
import { GRAPH_VERSION } from './wa-types';

const TOKEN = 'EAAsuperSecretBusinessIntegrationToken';
const WABA_ID = '111222333';
const PHONE_NUMBER_ID = '444555666';

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

const liveRow = () =>
  ({
    id: 'conn-1',
    companyId: 'company-1',
    userId: 'user-1',
    wabaId: WABA_ID,
    phoneNumberId: PHONE_NUMBER_ID,
    status: WhatsappConnectionStatus.CONNECTED,
    connectedAt: new Date('2026-09-30T09:10:34.000Z'),
    lifecycleEventAt: new Date('2026-09-30T09:10:34.000Z'),
    tokenUpdatedAt: new Date('2026-09-30T09:10:34.000Z'),
    disconnectReason: 'PARTNER_REMOVED',
  }) as any;

describe('WhatsappDiagnosticsService', () => {
  let service: WhatsappDiagnosticsService;
  let store: { getLastMessageTimes: jest.Mock };
  let fetchMock: jest.Mock;
  let savedAppId: string | undefined;

  beforeEach(() => {
    savedAppId = process.env.WHATSAPP_APP_ID;
    process.env.WHATSAPP_APP_ID = 'app-id-1';
    store = {
      getLastMessageTimes: jest.fn().mockResolvedValue({
        lastInboundAt: new Date('2026-10-05T07:05:28.000Z'),
        lastOutboundAt: new Date('2026-10-04T10:00:00.000Z'),
      }),
    };
    fetchMock = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as any);
    service = new WhatsappDiagnosticsService(store as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (savedAppId === undefined) delete process.env.WHATSAPP_APP_ID;
    else process.env.WHATSAPP_APP_ID = savedAppId;
  });

  describe('captureDisconnectSnapshot', () => {
    it('records the row state, message times and the subscription check, never the token', async () => {
      fetchMock.mockResolvedValueOnce(
        ok({
          data: [
            { whatsapp_business_api_data: { id: 'other-app' } },
            { whatsapp_business_api_data: { id: 'app-id-1' } },
          ],
        }),
      );

      const snapshot = await service.captureDisconnectSnapshot(
        liveRow(),
        TOKEN,
        'SELF_DISCONNECTED',
      );

      const [getUrl, getInit] = fetchMock.mock.calls[0];
      expect(getUrl).toBe(
        `https://graph.facebook.com/${GRAPH_VERSION}/${WABA_ID}/subscribed_apps`,
      );
      expect(getInit.method).toBe('GET');
      expect(getInit.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
      expect(store.getLastMessageTimes).toHaveBeenCalledWith(
        'company-1',
        'user-1',
      );
      expect(snapshot).toEqual({
        capturedAt: expect.any(String),
        reason: 'SELF_DISCONNECTED',
        status: WhatsappConnectionStatus.CONNECTED,
        wabaId: WABA_ID,
        phoneNumberId: PHONE_NUMBER_ID,
        connectedAt: '2026-09-30T09:10:34.000Z',
        lifecycleEventAt: '2026-09-30T09:10:34.000Z',
        tokenUpdatedAt: '2026-09-30T09:10:34.000Z',
        previousDisconnectReason: 'PARTNER_REMOVED',
        lastInboundAt: '2026-10-05T07:05:28.000Z',
        lastOutboundAt: '2026-10-04T10:00:00.000Z',
        subscription: {
          attempted: true,
          appSubscribed: true,
          subscribedAppIds: ['other-app', 'app-id-1'],
          error: null,
        },
      });
      expect(JSON.stringify(snapshot)).not.toContain(TOKEN);
    });

    it('records that our app is missing from the WABA subscription', async () => {
      fetchMock.mockResolvedValueOnce(ok({ data: [] }));

      const snapshot = await service.captureDisconnectSnapshot(
        liveRow(),
        TOKEN,
        'SELF_DISCONNECTED',
      );

      expect(snapshot.subscription).toEqual({
        attempted: true,
        appSubscribed: false,
        subscribedAppIds: [],
        error: null,
      });
    });

    it('reports an unknown subscription state when the app id is not configured', async () => {
      delete process.env.WHATSAPP_APP_ID;
      fetchMock.mockResolvedValueOnce(
        ok({ data: [{ whatsapp_business_api_data: { id: 'app-id-1' } }] }),
      );

      const snapshot = await service.captureDisconnectSnapshot(
        liveRow(),
        TOKEN,
        'SELF_DISCONNECTED',
      );

      expect(snapshot.subscription.appSubscribed).toBeNull();
      expect(snapshot.subscription.subscribedAppIds).toEqual(['app-id-1']);
    });

    it('keeps the Graph error, with its HTTP cause, and logs it', async () => {
      const error = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockResolvedValueOnce(fail(400, 'Unsupported get request'));

      const snapshot = await service.captureDisconnectSnapshot(
        liveRow(),
        TOKEN,
        'SELF_DISCONNECTED',
      );

      expect(snapshot.subscription.attempted).toBe(true);
      expect(snapshot.subscription.appSubscribed).toBeNull();
      expect(snapshot.subscription.error).toContain(
        'WhatsApp subscription check failed',
      );
      expect(snapshot.subscription.error).toContain('HTTP 400');
      expect(snapshot.subscription.error).toContain('Unsupported get request');
      expect(error).toHaveBeenCalled();
      expect(String(error.mock.calls[0][0])).not.toContain(TOKEN);
    });

    it('resolves with the network error when Meta cannot be reached', async () => {
      jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);
      fetchMock.mockRejectedValueOnce(new Error('network down'));

      const snapshot = await service.captureDisconnectSnapshot(
        liveRow(),
        TOKEN,
        'SELF_DISCONNECTED',
      );

      expect(snapshot.subscription.error).toContain('network down');
    });

    it('resolves with null message times and a warning when the store fails', async () => {
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
      store.getLastMessageTimes.mockRejectedValueOnce(new Error('db timeout'));
      fetchMock.mockResolvedValueOnce(ok({ data: [] }));

      const snapshot = await service.captureDisconnectSnapshot(
        liveRow(),
        TOKEN,
        'SELF_DISCONNECTED',
      );

      expect(snapshot.lastInboundAt).toBeNull();
      expect(snapshot.lastOutboundAt).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('db timeout'));
    });

    it('skips the Graph check when no token can be read', async () => {
      const snapshot = await service.captureDisconnectSnapshot(
        liveRow(),
        null,
        'SEAT_REMOVED',
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(snapshot.reason).toBe('SEAT_REMOVED');
      expect(snapshot.subscription).toEqual({
        attempted: false,
        appSubscribed: null,
        subscribedAppIds: [],
        error: 'No readable stored token',
      });
    });
  });
});
