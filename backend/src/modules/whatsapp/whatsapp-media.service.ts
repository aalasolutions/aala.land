import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Role } from '@shared/enums/roles.enum';
import { errorMessage } from '@shared/utils/error.util';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { MessageStoreService } from './message-store.service';
import { WhatsappGateway } from './whatsapp.gateway';
import {
  WaMediaJobData,
  WaMediaStatus,
  WA_MEDIA_INGEST_JOB,
  WA_MEDIA_QUEUE,
} from './wa-types';
import { countsTowardQuota, resolveMediaUrlTtlSeconds } from './wa-media.util';
import { StoragePurgeService } from '../storage-purge/storage-purge.service';
import {
  buildWhatsappClient,
  getWhatsappBucket,
} from '../storage-purge/storage-targets.util';
import { RecordHistoryService } from '../record-history/record-history.service';
import { RecordHistoryAction } from '../record-history/entities/record-history.entity';

const INLINE_MEDIA_TYPES = new Set(['image', 'video', 'audio', 'sticker']);

export interface WaMediaCaller {
  userId: string;
  role: string;
}

export interface WaMediaDeleteActor extends WaMediaCaller {
  companyId: string;
  reason: string;
}

export interface WaSignedMediaUrl {
  url: string;
  expiresAt: string;
  mime: string | null;
  sizeBytes: number | null;
  fileName: string | null;
}

@Injectable()
export class WhatsappMediaService {
  private readonly logger = new Logger(WhatsappMediaService.name);
  private client: S3Client | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly messageStore: MessageStoreService,
    private readonly storagePurge: StoragePurgeService,
    private readonly recordHistory: RecordHistoryService,
    private readonly gateway: WhatsappGateway,
    @InjectQueue(WA_MEDIA_QUEUE)
    private readonly mediaQueue: Queue<WaMediaJobData>,
  ) {}

  async signUrl(
    companyId: string,
    user: WaMediaCaller,
    uuid: string,
  ): Promise<WaSignedMediaUrl> {
    const row = await this.messageStore.findRowByUuid(companyId, uuid);
    this.assertCanAccess(row, user);
    const mediaKey = this.requireStoredKey(row);

    const ttl = resolveMediaUrlTtlSeconds();
    const now = new Date();
    const url = await getSignedUrl(
      this.getClient(),
      new GetObjectCommand({
        Bucket: getWhatsappBucket(),
        Key: mediaKey,
        ...(row.mediaMime ? { ResponseContentType: row.mediaMime } : {}),
        ResponseContentDisposition: contentDisposition(
          row.mediaType,
          row.mediaFileName,
        ),
      }),
      { expiresIn: ttl, signingDate: now },
    );

    return {
      url,
      expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
      mime: row.mediaMime,
      sizeBytes: row.mediaSizeBytes,
      fileName: row.mediaFileName,
    };
  }

  // Without an actor this is the revoke path: no access check, no history, PENDING is closed without a purge.
  async deleteStoredMedia(
    companyId: string,
    uuid: string,
    deletedBy: string,
    actor?: WaMediaDeleteActor,
  ): Promise<void> {
    const result = await this.dataSource.transaction(async (manager) => {
      const row = await manager.findOne(WhatsappMessage, {
        where: { companyId, id: uuid },
        lock: { mode: 'pessimistic_write' },
      });
      if (actor) {
        this.assertCanAccess(row, actor);
        this.requireStoredKey(row);
      }
      if (!actor && row?.mediaStatus === WaMediaStatus.PENDING) {
        // No file exists yet; the ingest sees DELETED and never downloads.
        await manager.update(
          WhatsappMessage,
          { companyId, id: row.id },
          {
            mediaStatus: WaMediaStatus.DELETED,
            mediaDeletedAt: new Date(),
            mediaDeletedBy: deletedBy,
          },
        );
        return { ids: [], companyId: row.companyId, userId: row.userId };
      }
      if (!row || row.mediaStatus !== WaMediaStatus.STORED || !row.mediaKey) {
        return null;
      }

      const ids = await this.storagePurge.purge(manager, {
        whatsapp: [
          {
            companyId: row.companyId,
            s3Key: row.mediaKey,
            // Stickers were never counted against quota.
            bytes: countsTowardQuota(row.mediaType)
              ? (row.mediaSizeBytes ?? 0)
              : 0,
            sourceId: row.id,
          },
        ],
      });

      await manager.update(
        WhatsappMessage,
        { companyId, id: row.id },
        {
          mediaStatus: WaMediaStatus.DELETED,
          mediaDeletedAt: new Date(),
          mediaDeletedBy: deletedBy,
        },
      );

      if (actor) {
        await this.recordHistory.record(manager, {
          companyId: row.companyId,
          action: RecordHistoryAction.DELETE,
          entityType: 'WhatsappMessage',
          entityId: row.id,
          entityTitle: row.mediaFileName || `${row.mediaType || 'media'} file`,
          contextTitle: row.chatId,
          reason: actor.reason,
          actorId: actor.userId,
          actorName: await this.recordHistory.resolveActorName(
            manager,
            actor.userId,
          ),
          metadata: { scope: 'media', mediaType: row.mediaType },
        });
      }

      return { ids, companyId: row.companyId, userId: row.userId };
    });
    if (!result) return;

    await this.storagePurge.dispatch(result.ids);

    // The delete is committed; a failed repaint must not report it as failed.
    try {
      const message = await this.messageStore.getMessageByUuid(
        result.companyId,
        uuid,
      );
      if (message) this.gateway.emitMessageUpdate(result.userId, message);
    } catch (err) {
      this.logger.warn(
        `Media deleted but repaint failed for ${uuid}: ${errorMessage(err)}`,
      );
    }
  }

  // Log-only, so a connect never fails on it; a job stopped for want of a connection stays failed under the row id.
  async resumePendingMedia(companyId: string, userId: string): Promise<void> {
    try {
      const uuids = await this.messageStore.findPendingMediaUuidsForUser(
        companyId,
        userId,
      );
      if (uuids.length === 0) return;
      for (const uuid of uuids) {
        try {
          const job = await this.mediaQueue.getJob(uuid);
          if (job && (await job.isFailed())) {
            await job.retry('failed', {
              resetAttemptsMade: true,
              resetAttemptsStarted: true,
            });
          }
        } catch (err) {
          this.logger.warn(
            `Could not retry the media job of row ${uuid}: ${errorMessage(err)}`,
          );
        }
      }
      await this.mediaQueue.addBulk(
        uuids.map((uuid) => ({
          name: WA_MEDIA_INGEST_JOB,
          data: { messageUuid: uuid, companyId },
          opts: { jobId: uuid },
        })),
      );
      this.logger.log(
        `Resumed ${uuids.length} pending media downloads for user ${userId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to resume pending media for user ${userId}`,
        errorMessage(err, true),
      );
    }
  }

  private assertCanAccess(
    row: WhatsappMessage | null,
    user: WaMediaCaller,
  ): asserts row is WhatsappMessage {
    if (!row) throw new NotFoundException('Message not found');
    if (
      row.userId !== user.userId &&
      (user.role as Role) !== Role.COMPANY_ADMIN
    ) {
      throw new ForbiddenException('You do not have access to this message');
    }
  }

  private requireStoredKey(row: WhatsappMessage): string {
    if (row.mediaStatus !== WaMediaStatus.STORED || !row.mediaKey) {
      throw new ConflictException(
        `Media is not available (status: ${row.mediaStatus ?? 'NONE'})`,
      );
    }
    return row.mediaKey;
  }

  private getClient(): S3Client {
    if (!this.client) {
      this.client = buildWhatsappClient();
    }
    return this.client;
  }
}

function contentDisposition(
  mediaType: string,
  fileName: string | null,
): string {
  if (INLINE_MEDIA_TYPES.has(mediaType)) return 'inline';
  const name = fileName?.trim() || 'file';
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
