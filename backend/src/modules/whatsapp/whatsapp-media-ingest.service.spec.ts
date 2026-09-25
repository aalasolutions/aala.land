import { createHash } from 'node:crypto';
import { UnrecoverableError } from 'bullmq';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { addStorageUsage } from '@shared/utils/storage-quota.util';
import {
  WaMediaAwaitingConnectionError,
  WhatsappMediaIngestService,
  sha256Matches,
} from './whatsapp-media-ingest.service';
import { WhatsappCloudApiService } from './whatsapp-cloud-api.service';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { WaMediaStatus } from './wa-types';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  DeleteObjectCommand: jest.fn((input) => input),
}));

interface MockUpload {
  params: {
    Bucket: string;
    Key: string;
    ContentType: string;
    CacheControl: string;
  };
  partSize: number;
  queueSize: number;
  received?: Buffer;
}
const mockUploads: MockUpload[] = [];
let mockUploadFailure: Error | null = null;

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation((opts) => {
    const record = { ...opts } as MockUpload & {
      params: { Body: AsyncIterable<Buffer> };
    };
    mockUploads.push(record);
    return {
      done: async () => {
        // A failing uploader never drains the body, as the real SDK behaves when every part fails.
        if (mockUploadFailure) throw mockUploadFailure;
        const chunks: Buffer[] = [];
        for await (const chunk of record.params.Body) chunks.push(chunk);
        record.received = Buffer.concat(chunks);
        return {};
      },
    };
  }),
}));

jest.mock('@shared/utils/storage-quota.util', () => ({
  addStorageUsage: jest.fn().mockResolvedValue(undefined),
}));

const PAYLOAD = Buffer.from('fake image bytes for the ingest test');
const PAYLOAD_SHA_B64 = createHash('sha256').update(PAYLOAD).digest('base64');
const PAYLOAD_SHA_HEX = createHash('sha256').update(PAYLOAD).digest('hex');

const mediaRow = (overrides: Partial<WhatsappMessage> = {}) =>
  ({
    id: 'row-1',
    companyId: 'company-1',
    userId: 'user-1',
    chatId: '971501234567',
    waMessageId: 'wamid.HBg+ab/c=',
    hasMedia: true,
    mediaType: 'image',
    mediaMetaId: 'meta-media-1',
    mediaMime: 'image/jpeg',
    mediaFileName: 'image-wamid_HBg_ab_c_.jpg',
    mediaSha256: PAYLOAD_SHA_B64,
    mediaStatus: WaMediaStatus.PENDING,
    ...overrides,
  }) as WhatsappMessage;

const graphMedia = (sha256 = PAYLOAD_SHA_B64) =>
  new Response(
    JSON.stringify({
      url: 'https://lookaside.example/dl',
      file_size: PAYLOAD.length,
      mime_type: 'image/jpeg',
      sha256,
      id: 'meta-media-1',
    }),
    { status: 200 },
  );

describe('WhatsappMediaIngestService', () => {
  let service: WhatsappMediaIngestService;
  let store: {
    findRowByUuid: jest.Mock;
    getMessageByUuid: jest.Mock;
    markPendingMediaFailed: jest.Mock;
  };
  let media: { deleteStoredMedia: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    update: jest.Mock;
    getRepository: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let storagePurge: { purge: jest.Mock; dispatch: jest.Mock };
  let events: string[];
  let gateway: { emitMessageUpdate: jest.Mock };
  let connections: { findOne: jest.Mock };
  let fetchMock: jest.Mock;
  const originalEnv = process.env;
  const job = { messageUuid: 'row-1', companyId: 'company-1' };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AWS_WHATSAPP_ACCESS_KEY_ID: 'wa-key',
      AWS_WHATSAPP_SECRET_ACCESS_KEY: 'wa-secret',
      AWS_S3_WHATSAPP_BUCKET: 'test-whatsapp-bucket',
    };
    mockUploads.length = 0;
    mockUploadFailure = null;
    mockSend.mockReset().mockResolvedValue({});
    (addStorageUsage as jest.Mock).mockClear();
    (DeleteObjectCommand as unknown as jest.Mock).mockClear();

    store = {
      findRowByUuid: jest.fn().mockResolvedValue(mediaRow()),
      getMessageByUuid: jest.fn().mockResolvedValue({
        uuid: 'row-1',
        mediaStatus: WaMediaStatus.STORED,
      }),
      markPendingMediaFailed: jest.fn().mockResolvedValue(true),
    };
    media = { deleteStoredMedia: jest.fn().mockResolvedValue(undefined) };
    events = [];
    manager = {
      findOne: jest.fn().mockResolvedValue(mediaRow()),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      getRepository: jest.fn(() => ({ tx: true })),
    };
    dataSource = {
      transaction: jest.fn(
        async (cb: (m: typeof manager) => Promise<unknown>) => {
          const result = await cb(manager);
          events.push('commit');
          return result;
        },
      ),
    };
    storagePurge = {
      purge: jest.fn(() => {
        events.push('purge');
        return Promise.resolve(['purge-1']);
      }),
      dispatch: jest.fn(() => {
        events.push('dispatch');
        return Promise.resolve();
      }),
    };
    gateway = { emitMessageUpdate: jest.fn() };
    connections = {
      findOne: jest.fn().mockResolvedValue({
        id: 'conn-1',
        companyId: 'company-1',
        userId: 'user-1',
        phoneNumberId: 'pnid-1',
        accessTokenCiphertext: 'cipher',
      }),
    };
    fetchMock = jest.fn((url: string) =>
      Promise.resolve(
        url.startsWith('https://graph.facebook.com/')
          ? graphMedia()
          : new Response(PAYLOAD, { status: 200 }),
      ),
    );
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock as any);

    const cloudApi = new WhatsappCloudApiService(
      connections as any,
      {} as any,
      {} as any,
      {} as any,
      { decrypt: () => 'token-1' } as any,
    );
    service = new WhatsappMediaIngestService(
      store as any,
      cloudApi,
      gateway as any,
      dataSource as any,
      storagePurge as any,
      media as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('ends the download at once when the upload fails instead of waiting for the timeout', async () => {
    mockUploadFailure = new Error('upload boom');
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.startsWith('https://graph.facebook.com/')
          ? graphMedia()
          : new Response(endless, { status: 200 }),
      ),
    );

    await expect(service.ingest(job, 4, 5)).rejects.toThrow('upload boom');
    expect(mockUploads).toHaveLength(1);
    expect(store.markPendingMediaFailed).toHaveBeenCalledWith(
      'company-1',
      'row-1',
    );
  });

  it('streams the file into the bucket, stores the row, counts quota and pushes it', async () => {
    await service.ingest(job, 0, 5);

    expect(mockUploads).toHaveLength(1);
    const [upload] = mockUploads;
    const key = 'whatsapp/company-1/user-1/971501234567/wamid_HBg_ab_c_.jpg';
    expect(upload.params).toEqual(
      expect.objectContaining({
        Bucket: 'test-whatsapp-bucket',
        Key: key,
        ContentType: 'image/jpeg',
        CacheControl: 'private, max-age=600',
      }),
    );
    expect(upload.partSize).toBe(8 * 1024 * 1024);
    expect(upload.queueSize).toBe(2);
    expect(upload.received?.equals(PAYLOAD)).toBe(true);

    const [graphUrl, graphInit] = fetchMock.mock.calls[0];
    expect(graphUrl).toContain('/meta-media-1?phone_number_id=pnid-1');
    expect(graphInit.headers).toEqual({ Authorization: 'Bearer token-1' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://lookaside.example/dl');

    expect(manager.findOne).toHaveBeenCalledWith(WhatsappMessage, {
      where: { companyId: 'company-1', id: 'row-1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.update).toHaveBeenCalledWith(
      WhatsappMessage,
      { companyId: 'company-1', id: 'row-1' },
      {
        mediaKey: key,
        mediaSizeBytes: PAYLOAD.length,
        mediaMime: 'image/jpeg',
        mediaStatus: WaMediaStatus.STORED,
        mediaStoredAt: expect.any(Date),
      },
    );
    expect(addStorageUsage).toHaveBeenCalledWith(
      { tx: true },
      'company-1',
      PAYLOAD.length,
    );
    expect(storagePurge.purge).not.toHaveBeenCalled();
    expect(storagePurge.dispatch).toHaveBeenCalledWith([]);
    expect(gateway.emitMessageUpdate).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ uuid: 'row-1' }),
    );
  });

  it('names a nameless row and uses the TTL from the environment', async () => {
    process.env.WHATSAPP_MEDIA_URL_TTL_SECONDS = '300';
    store.findRowByUuid.mockResolvedValue(mediaRow({ mediaFileName: null }));

    await service.ingest(job, 0, 5);

    expect(mockUploads[0].params.CacheControl).toBe('private, max-age=300');
    expect(manager.update).toHaveBeenCalledWith(
      WhatsappMessage,
      { companyId: 'company-1', id: 'row-1' },
      expect.objectContaining({ mediaFileName: 'image-wamid_HBg_ab_c_.jpg' }),
    );
  });

  it('keys a document by the extension of its own file name', async () => {
    store.findRowByUuid.mockResolvedValue(
      mediaRow({
        mediaType: 'document',
        mediaMime: 'application/octet-stream',
        mediaFileName: 'Contract.DOCX',
      }),
    );

    await service.ingest(job, 0, 5);

    expect(mockUploads[0].params.Key).toBe(
      'whatsapp/company-1/user-1/971501234567/wamid_HBg_ab_c_.docx',
    );
  });

  it('accepts a hex hash as well as base64', async () => {
    store.findRowByUuid.mockResolvedValue(
      mediaRow({ mediaSha256: PAYLOAD_SHA_HEX }),
    );

    await service.ingest(job, 0, 5);

    expect(manager.update).toHaveBeenCalledWith(
      WhatsappMessage,
      { companyId: 'company-1', id: 'row-1' },
      expect.objectContaining({ mediaStatus: WaMediaStatus.STORED }),
    );
  });

  it('does not count a sticker against the quota', async () => {
    store.findRowByUuid.mockResolvedValue(
      mediaRow({ mediaType: 'sticker', mediaMime: 'image/webp' }),
    );

    await service.ingest(job, 0, 5);

    expect(manager.update).toHaveBeenCalled();
    expect(addStorageUsage).not.toHaveBeenCalled();
  });

  it('deletes its own write and throws for a retry on a sha256 mismatch', async () => {
    store.findRowByUuid.mockResolvedValue(
      mediaRow({
        mediaSha256: createHash('sha256').update('other').digest('base64'),
      }),
    );

    await expect(service.ingest(job, 0, 5)).rejects.toThrow('sha256 mismatch');

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-whatsapp-bucket',
      Key: 'whatsapp/company-1/user-1/971501234567/wamid_HBg_ab_c_.jpg',
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(gateway.emitMessageUpdate).not.toHaveBeenCalled();
  });

  it('marks FAILED without a retry when Meta no longer has the media', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 100, error_subcode: 33 } }),
        {
          status: 400,
        },
      ),
    );

    await expect(service.ingest(job, 0, 5)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(store.markPendingMediaFailed).toHaveBeenCalledWith(
      'company-1',
      'row-1',
    );
    expect(mockUploads).toHaveLength(0);
    expect(gateway.emitMessageUpdate).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ uuid: 'row-1' }),
    );
  });

  it('marks FAILED without a retry when the row has no media id', async () => {
    store.findRowByUuid.mockResolvedValue(mediaRow({ mediaMetaId: null }));

    await expect(service.ingest(job, 0, 5)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(store.markPendingMediaFailed).toHaveBeenCalledWith(
      'company-1',
      'row-1',
    );
  });

  it.each([
    ['no CONNECTED number', () => connections.findOne.mockResolvedValue(null)],
    [
      'no usable token',
      () =>
        jest
          .spyOn(service['cloudApi'], 'resolveAccessToken')
          .mockReturnValue(null),
    ],
  ])(
    'stops without an attempt and leaves the row PENDING when there is %s, even on the last attempt',
    async (_label, arrange) => {
      arrange();
      const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);

      await expect(service.ingest(job, 4, 5)).rejects.toBeInstanceOf(
        WaMediaAwaitingConnectionError,
      );
      expect(store.markPendingMediaFailed).not.toHaveBeenCalled();
      expect(gateway.emitMessageUpdate).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('stays PENDING'),
      );
    },
  );

  it('leaves the row PENDING on a retryable failure before the last attempt', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

    await expect(service.ingest(job, 1, 5)).rejects.toThrow('500');
    expect(store.markPendingMediaFailed).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
    expect(gateway.emitMessageUpdate).not.toHaveBeenCalled();
  });

  it('marks FAILED on the final attempt and pushes the row before rethrowing', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

    await expect(service.ingest(job, 4, 5)).rejects.toThrow('500');
    expect(store.markPendingMediaFailed).toHaveBeenCalledWith(
      'company-1',
      'row-1',
    );
    expect(gateway.emitMessageUpdate).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ uuid: 'row-1' }),
    );
  });

  it('does not push when another writer settled the row before FAILED', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    store.markPendingMediaFailed.mockResolvedValue(false);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    await expect(service.ingest(job, 4, 5)).rejects.toThrow('500');
    expect(gateway.emitMessageUpdate).not.toHaveBeenCalled();
  });

  it.each([
    WaMediaStatus.STORED,
    WaMediaStatus.FAILED,
    WaMediaStatus.DELETED,
    WaMediaStatus.TOO_LARGE,
  ])('is a no-op for a %s row', async (mediaStatus) => {
    store.findRowByUuid.mockResolvedValue(mediaRow({ mediaStatus }));

    await service.ingest(job, 0, 5);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
    expect(media.deleteStoredMedia).not.toHaveBeenCalled();
  });

  it.each([
    [false, 'CUSTOMER_REVOKE'],
    [true, 'BUSINESS_APP_REVOKE'],
  ])(
    'settles a deleted PENDING row (fromMe %s) through the revoke path without downloading',
    async (fromMe, deletedBy) => {
      store.findRowByUuid.mockResolvedValue(
        mediaRow({ deletedAt: new Date(), fromMe }),
      );

      await service.ingest(job, 0, 5);

      expect(media.deleteStoredMedia).toHaveBeenCalledWith(
        'company-1',
        'row-1',
        deletedBy,
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockUploads).toHaveLength(0);
    },
  );

  it('purges its upload and settles DELETED when the message was revoked mid-upload', async () => {
    manager.findOne.mockResolvedValue(
      mediaRow({ deletedAt: new Date(), fromMe: false }),
    );

    await service.ingest(job, 0, 5);

    expect(storagePurge.purge).toHaveBeenCalledWith(manager, {
      whatsapp: [
        {
          companyId: 'company-1',
          s3Key: 'whatsapp/company-1/user-1/971501234567/wamid_HBg_ab_c_.jpg',
          bytes: 0,
          sourceId: 'row-1',
        },
      ],
    });
    expect(manager.update).toHaveBeenCalledWith(
      WhatsappMessage,
      { companyId: 'company-1', id: 'row-1' },
      {
        mediaStatus: WaMediaStatus.DELETED,
        mediaDeletedAt: expect.any(Date),
        mediaDeletedBy: 'CUSTOMER_REVOKE',
      },
    );
    expect(addStorageUsage).not.toHaveBeenCalled();
    expect(storagePurge.dispatch).toHaveBeenCalledWith(['purge-1']);
    expect(events).toEqual(['purge', 'commit', 'dispatch']);
    expect(gateway.emitMessageUpdate).not.toHaveBeenCalled();
  });

  it('purges its upload without touching a row the revoke already settled', async () => {
    manager.findOne.mockResolvedValue(
      mediaRow({ deletedAt: new Date(), mediaStatus: WaMediaStatus.DELETED }),
    );

    await service.ingest(job, 0, 5);

    expect(storagePurge.purge).toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
    expect(storagePurge.dispatch).toHaveBeenCalledWith(['purge-1']);
    expect(gateway.emitMessageUpdate).not.toHaveBeenCalled();
  });

  it('builds the WhatsApp client once across jobs', async () => {
    const { S3Client } = jest.requireMock('@aws-sdk/client-s3');
    (S3Client as jest.Mock).mockClear();

    await service.ingest(job, 0, 5);
    await service.ingest(job, 0, 5);

    expect(S3Client).toHaveBeenCalledTimes(1);
  });

  it('logs the original error first and keeps it when marking FAILED fails', async () => {
    const error = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 131000 } }), {
        status: 500,
      }),
    );
    store.markPendingMediaFailed.mockRejectedValue(new Error('db down'));

    await expect(service.ingest(job, 4, 5)).rejects.toThrow('500');

    expect(error.mock.calls[0][0]).toContain('graph code 131000');
    expect(error.mock.calls[1][0]).toContain('Failed to mark media FAILED');
  });

  it('is a no-op for a row outside the company', async () => {
    store.findRowByUuid.mockResolvedValue(null);

    await service.ingest(job, 0, 5);

    expect(store.findRowByUuid).toHaveBeenCalledWith('company-1', 'row-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('sha256Matches', () => {
    const digest = createHash('sha256').update(PAYLOAD).digest();

    it('matches base64 and hex', () => {
      expect(sha256Matches(digest, PAYLOAD_SHA_B64)).toBe(true);
      expect(sha256Matches(digest, PAYLOAD_SHA_HEX.toUpperCase())).toBe(true);
    });

    it('rejects a different or malformed hash', () => {
      expect(sha256Matches(digest, 'bm90IGEgaGFzaA==')).toBe(false);
      expect(sha256Matches(digest, '')).toBe(false);
    });
  });
});
