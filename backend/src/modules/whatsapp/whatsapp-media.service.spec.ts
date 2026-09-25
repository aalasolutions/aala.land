import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { WhatsappMediaService } from './whatsapp-media.service';
import { MessageStoreService } from './message-store.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { WaMediaStatus, WA_MEDIA_DELETED_BY, WA_MEDIA_QUEUE } from './wa-types';
import { StoragePurgeService } from '../storage-purge/storage-purge.service';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';
import { Role } from '@shared/enums/roles.enum';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({})),
  GetObjectCommand: jest.fn((input) => ({ input })),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const COMPANY = 'c0000000-0000-0000-0000-000000000001';
const UUID = 'a0000000-0000-0000-0000-000000000001';
const OWNER = 'u-owner';

describe('WhatsappMediaService', () => {
  let service: WhatsappMediaService;
  let messageStore: {
    findRowByUuid: jest.Mock;
    getMessageByUuid: jest.Mock;
    findPendingMediaUuidsForUser: jest.Mock;
  };
  let mediaQueue: { getJob: jest.Mock; addBulk: jest.Mock };
  let purge: { purge: jest.Mock; dispatch: jest.Mock };
  let history: { record: jest.Mock; resolveActorName: jest.Mock };
  let gateway: { emitMessageUpdate: jest.Mock };
  let manager: { findOne: jest.Mock; update: jest.Mock };
  let events: string[];
  const originalEnv = process.env;
  const signed = getSignedUrl as jest.Mock;

  const row = (overrides: Partial<WhatsappMessage> = {}) =>
    ({
      id: UUID,
      companyId: COMPANY,
      userId: OWNER,
      chatId: '971501234567',
      mediaType: 'image',
      mediaMime: 'image/jpeg',
      mediaFileName: null,
      mediaSizeBytes: 2048,
      mediaKey: `whatsapp/${COMPANY}/${UUID}`,
      mediaStatus: WaMediaStatus.STORED,
      ...overrides,
    }) as WhatsappMessage;

  const owner = { userId: OWNER, role: Role.AGENT };
  const actor = (overrides = {}) => ({
    companyId: COMPANY,
    userId: OWNER,
    role: Role.AGENT,
    reason: 'Sent by mistake',
    ...overrides,
  });

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AWS_WHATSAPP_ACCESS_KEY_ID: 'wa-key',
      AWS_WHATSAPP_SECRET_ACCESS_KEY: 'wa-secret',
      AWS_S3_WHATSAPP_BUCKET: 'test-wa-bucket',
    };
    delete process.env.WHATSAPP_MEDIA_URL_TTL_SECONDS;
    events = [];
    signed.mockResolvedValue('https://signed.example/obj?sig=1');
    messageStore = {
      findRowByUuid: jest.fn().mockResolvedValue(row()),
      getMessageByUuid: jest.fn().mockResolvedValue({ uuid: UUID }),
      findPendingMediaUuidsForUser: jest.fn().mockResolvedValue([]),
    };
    mediaQueue = {
      getJob: jest.fn().mockResolvedValue(undefined),
      addBulk: jest.fn().mockResolvedValue([]),
    };
    purge = {
      purge: jest.fn(async () => {
        events.push('purge');
        return ['purge-1'];
      }),
      dispatch: jest.fn(async () => {
        events.push('dispatch');
      }),
    };
    history = {
      record: jest.fn().mockResolvedValue(undefined),
      resolveActorName: jest.fn().mockResolvedValue('Test User'),
    };
    gateway = { emitMessageUpdate: jest.fn(() => events.push('emit')) };
    manager = {
      findOne: jest.fn().mockResolvedValue(row()),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => {
        const result = await fn(manager);
        events.push('commit');
        return result;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappMediaService,
        { provide: DataSource, useValue: dataSource },
        { provide: MessageStoreService, useValue: messageStore },
        { provide: StoragePurgeService, useValue: purge },
        { provide: RecordHistoryService, useValue: history },
        { provide: WhatsappGateway, useValue: gateway },
        { provide: getQueueToken(WA_MEDIA_QUEUE), useValue: mediaQueue },
      ],
    }).compile();

    service = module.get(WhatsappMediaService);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('signUrl', () => {
    it('404s when the row is not in the caller company', async () => {
      messageStore.findRowByUuid.mockResolvedValue(null);

      await expect(service.signUrl(COMPANY, owner, UUID)).rejects.toThrow(
        NotFoundException,
      );
      expect(messageStore.findRowByUuid).toHaveBeenCalledWith(COMPANY, UUID);
      expect(signed).not.toHaveBeenCalled();
    });

    it('403s for an agent who does not own the message', async () => {
      await expect(
        service.signUrl(
          COMPANY,
          { userId: 'u-other', role: Role.MANAGER },
          UUID,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(signed).not.toHaveBeenCalled();
    });

    it('lets a company admin sign media of another agent', async () => {
      await expect(
        service.signUrl(
          COMPANY,
          { userId: 'u-admin', role: Role.COMPANY_ADMIN },
          UUID,
        ),
      ).resolves.toMatchObject({ url: 'https://signed.example/obj?sig=1' });
    });

    it.each([
      [WaMediaStatus.PENDING, 'key'],
      [WaMediaStatus.DELETED, 'key'],
      [WaMediaStatus.STORED, null],
    ])(
      '409s when status is %s and key is %p',
      async (mediaStatus, mediaKey) => {
        messageStore.findRowByUuid.mockResolvedValue(
          row({ mediaStatus, mediaKey }),
        );

        await expect(service.signUrl(COMPANY, owner, UUID)).rejects.toThrow(
          ConflictException,
        );
        expect(signed).not.toHaveBeenCalled();
      },
    );

    it('signs an inline image with the default TTL and returns expiresAt from the same clock', async () => {
      const before = Date.now();
      const result = await service.signUrl(COMPANY, owner, UUID);

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-wa-bucket',
        Key: `whatsapp/${COMPANY}/${UUID}`,
        ResponseContentType: 'image/jpeg',
        ResponseContentDisposition: 'inline',
      });
      const [, , options] = signed.mock.calls[0];
      expect(options.expiresIn).toBe(600);
      expect(result.expiresAt).toBe(
        new Date(options.signingDate.getTime() + 600_000).toISOString(),
      );
      expect(options.signingDate.getTime()).toBeGreaterThanOrEqual(before);
      expect(result).toEqual({
        url: 'https://signed.example/obj?sig=1',
        expiresAt: result.expiresAt,
        mime: 'image/jpeg',
        sizeBytes: 2048,
        fileName: null,
      });
    });

    it('uses the TTL override and ignores one below the 60 second floor', async () => {
      process.env.WHATSAPP_MEDIA_URL_TTL_SECONDS = '120';
      await service.signUrl(COMPANY, owner, UUID);
      process.env.WHATSAPP_MEDIA_URL_TTL_SECONDS = '30';
      await service.signUrl(COMPANY, owner, UUID);

      expect(signed.mock.calls[0][2].expiresIn).toBe(120);
      expect(signed.mock.calls[1][2].expiresIn).toBe(600);
    });

    it('signs a document as an attachment with an ASCII fallback and a UTF-8 filename', async () => {
      messageStore.findRowByUuid.mockResolvedValue(
        row({
          mediaType: 'document',
          mediaMime: 'application/pdf',
          mediaFileName: 'عقد "Lease" (1).pdf',
        }),
      );

      await service.signUrl(COMPANY, owner, UUID);

      const input = (GetObjectCommand as unknown as jest.Mock).mock.calls[0][0];
      expect(input.ResponseContentType).toBe('application/pdf');
      expect(input.ResponseContentDisposition).toBe(
        'attachment; filename="___ _Lease_ (1).pdf"; ' +
          "filename*=UTF-8''%D8%B9%D9%82%D8%AF%20%22Lease%22%20%281%29.pdf",
      );
    });

    it('builds the WhatsApp client once across calls', async () => {
      const { S3Client } = jest.requireMock('@aws-sdk/client-s3');
      await service.signUrl(COMPANY, owner, UUID);
      await service.signUrl(COMPANY, owner, UUID);

      expect(S3Client).toHaveBeenCalledTimes(1);
      expect(signed.mock.calls[0][0]).toBe(signed.mock.calls[1][0]);
    });
  });

  describe('deleteStoredMedia', () => {
    it('purges, marks DELETED, records history, dispatches after commit and repaints the chat', async () => {
      await service.deleteStoredMedia(COMPANY, UUID, OWNER, actor());

      expect(manager.findOne).toHaveBeenCalledWith(WhatsappMessage, {
        where: { companyId: COMPANY, id: UUID },
        lock: { mode: 'pessimistic_write' },
      });
      expect(purge.purge).toHaveBeenCalledWith(manager, {
        whatsapp: [
          {
            companyId: COMPANY,
            s3Key: `whatsapp/${COMPANY}/${UUID}`,
            bytes: 2048,
            sourceId: UUID,
          },
        ],
      });
      expect(manager.update).toHaveBeenCalledWith(
        WhatsappMessage,
        { companyId: COMPANY, id: UUID },
        {
          mediaStatus: WaMediaStatus.DELETED,
          mediaDeletedAt: expect.any(Date),
          mediaDeletedBy: OWNER,
        },
      );
      expect(history.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          companyId: COMPANY,
          action: RecordHistoryAction.DELETE,
          entityType: 'WhatsappMessage',
          entityId: UUID,
          reason: 'Sent by mistake',
          actorId: OWNER,
          actorName: 'Test User',
        }),
      );
      expect(purge.dispatch).toHaveBeenCalledWith(['purge-1']);
      expect(messageStore.getMessageByUuid).toHaveBeenCalledWith(COMPANY, UUID);
      expect(gateway.emitMessageUpdate).toHaveBeenCalledWith(OWNER, { uuid: UUID });
      expect(events).toEqual(['purge', 'commit', 'dispatch', 'emit']);
    });

    it('releases 0 bytes for a sticker', async () => {
      manager.findOne.mockResolvedValue(row({ mediaType: 'sticker' }));

      await service.deleteStoredMedia(COMPANY, UUID, OWNER, actor());

      expect(purge.purge.mock.calls[0][1].whatsapp[0].bytes).toBe(0);
    });

    it('lets a company admin delete, repainting for the owning agent', async () => {
      await service.deleteStoredMedia(
        COMPANY,
        UUID,
        'u-admin',
        actor({ userId: 'u-admin', role: Role.COMPANY_ADMIN }),
      );

      expect(manager.update.mock.calls[0][2].mediaDeletedBy).toBe('u-admin');
      expect(gateway.emitMessageUpdate).toHaveBeenCalledWith(OWNER, { uuid: UUID });
    });

    it('403s a non-owner agent without purging', async () => {
      await expect(
        service.deleteStoredMedia(
          COMPANY,
          UUID,
          'u-other',
          actor({ userId: 'u-other' }),
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(purge.purge).not.toHaveBeenCalled();
      expect(purge.dispatch).not.toHaveBeenCalled();
    });

    it('404s on the actor path when the row is not in the actor company', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.deleteStoredMedia(COMPANY, UUID, OWNER, actor()),
      ).rejects.toThrow(NotFoundException);
    });

    it('409s on the actor path when media is not STORED', async () => {
      manager.findOne.mockResolvedValue(
        row({ mediaStatus: WaMediaStatus.DELETED }),
      );

      await expect(
        service.deleteStoredMedia(COMPANY, UUID, OWNER, actor()),
      ).rejects.toThrow(ConflictException);
      expect(purge.purge).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('settles PENDING as DELETED on the revoke path without a purge, and repaints', async () => {
      manager.findOne.mockResolvedValue(
        row({ mediaStatus: WaMediaStatus.PENDING, mediaKey: null }),
      );

      await service.deleteStoredMedia(
        COMPANY,
        UUID,
        WA_MEDIA_DELETED_BY.CUSTOMER_REVOKE,
      );

      expect(manager.findOne.mock.calls[0][1].lock).toEqual({
        mode: 'pessimistic_write',
      });
      expect(manager.update).toHaveBeenCalledWith(
        WhatsappMessage,
        { companyId: COMPANY, id: UUID },
        expect.objectContaining({
          mediaStatus: WaMediaStatus.DELETED,
          mediaDeletedAt: expect.any(Date),
          mediaDeletedBy: 'CUSTOMER_REVOKE',
        }),
      );
      expect(purge.purge).not.toHaveBeenCalled();
      expect(history.record).not.toHaveBeenCalled();
      expect(gateway.emitMessageUpdate).toHaveBeenCalledWith(OWNER, { uuid: UUID });
    });

    it.each([WaMediaStatus.FAILED, WaMediaStatus.DELETED, null])(
      'is a silent no-op on the revoke path when media is %s',
      async (mediaStatus) => {
        manager.findOne.mockResolvedValue(row({ mediaStatus }));

        await expect(
          service.deleteStoredMedia(
            COMPANY,
            UUID,
            WA_MEDIA_DELETED_BY.CUSTOMER_REVOKE,
          ),
        ).resolves.toBeUndefined();
        expect(manager.update).not.toHaveBeenCalled();
        expect(purge.purge).not.toHaveBeenCalled();
        expect(purge.dispatch).not.toHaveBeenCalled();
        expect(gateway.emitMessageUpdate).not.toHaveBeenCalled();
      },
    );

    it('409s on the actor path when media is PENDING', async () => {
      manager.findOne.mockResolvedValue(
        row({ mediaStatus: WaMediaStatus.PENDING, mediaKey: null }),
      );

      await expect(
        service.deleteStoredMedia(COMPANY, UUID, OWNER, actor()),
      ).rejects.toThrow(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('purges on the revoke path with the company filter and no history', async () => {
      await service.deleteStoredMedia(
        COMPANY,
        UUID,
        WA_MEDIA_DELETED_BY.CUSTOMER_REVOKE,
      );

      expect(manager.findOne.mock.calls[0][1].where).toEqual({
        companyId: COMPANY,
        id: UUID,
      });
      expect(manager.update.mock.calls[0][2].mediaDeletedBy).toBe(
        'CUSTOMER_REVOKE',
      );
      expect(history.record).not.toHaveBeenCalled();
      expect(purge.dispatch).toHaveBeenCalledWith(['purge-1']);
    });

    it('does not fail a committed delete when the repaint fails', async () => {
      messageStore.getMessageByUuid.mockRejectedValue(new Error('db down'));
      jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      await expect(
        service.deleteStoredMedia(COMPANY, UUID, OWNER, actor()),
      ).resolves.toBeUndefined();
      expect(purge.dispatch).toHaveBeenCalled();
    });
  });

  describe('resumePendingMedia', () => {
    const failedJob = () => ({
      isFailed: jest.fn().mockResolvedValue(true),
      retry: jest.fn().mockResolvedValue(undefined),
    });

    it('queues the pending rows oldest first with the row id as job id', async () => {
      messageStore.findPendingMediaUuidsForUser.mockResolvedValue([
        'row-1',
        'row-2',
      ]);

      await service.resumePendingMedia(COMPANY, OWNER);

      expect(messageStore.findPendingMediaUuidsForUser).toHaveBeenCalledWith(
        COMPANY,
        OWNER,
      );
      expect(mediaQueue.addBulk).toHaveBeenCalledWith([
        {
          name: 'ingest',
          data: { messageUuid: 'row-1', companyId: COMPANY },
          opts: { jobId: 'row-1' },
        },
        {
          name: 'ingest',
          data: { messageUuid: 'row-2', companyId: COMPANY },
          opts: { jobId: 'row-2' },
        },
      ]);
    });

    it('retries a job left failed under the row id with its attempts reset', async () => {
      const job = failedJob();
      messageStore.findPendingMediaUuidsForUser.mockResolvedValue(['row-1']);
      mediaQueue.getJob.mockResolvedValue(job);

      await service.resumePendingMedia(COMPANY, OWNER);

      expect(mediaQueue.getJob).toHaveBeenCalledWith('row-1');
      expect(job.retry).toHaveBeenCalledWith('failed', {
        resetAttemptsMade: true,
        resetAttemptsStarted: true,
      });
    });

    it('does nothing when no media is pending', async () => {
      await service.resumePendingMedia(COMPANY, OWNER);

      expect(mediaQueue.addBulk).not.toHaveBeenCalled();
    });

    it('still queues the rest when one retry fails', async () => {
      const job = failedJob();
      job.retry.mockRejectedValue(new Error('locked'));
      messageStore.findPendingMediaUuidsForUser.mockResolvedValue(['row-1']);
      mediaQueue.getJob.mockResolvedValue(job);
      jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      await service.resumePendingMedia(COMPANY, OWNER);

      expect(mediaQueue.addBulk).toHaveBeenCalled();
    });

    it('never throws, so a connect is not failed by it', async () => {
      messageStore.findPendingMediaUuidsForUser.mockRejectedValue(
        new Error('db down'),
      );
      jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.resumePendingMedia(COMPANY, OWNER),
      ).resolves.toBeUndefined();
    });
  });
});
