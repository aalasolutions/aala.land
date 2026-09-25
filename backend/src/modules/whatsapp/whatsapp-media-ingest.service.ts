import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UnrecoverableError } from 'bullmq';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { Company } from '../companies/entities/company.entity';
import { StoragePurgeService } from '../storage-purge/storage-purge.service';
import {
  buildWhatsappClient,
  getWhatsappBucket,
} from '../storage-purge/storage-targets.util';
import { addStorageUsage } from '@shared/utils/storage-quota.util';
import { errorMessage } from '@shared/utils/error.util';
import { WhatsappMessage } from './entities/whatsapp-message.entity';
import { MessageStoreService } from './message-store.service';
import {
  WhatsappCloudApiService,
  WhatsappMediaFetchError,
  WhatsappMediaInfo,
} from './whatsapp-cloud-api.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappMediaService } from './whatsapp-media.service';
import { WaMediaJobData, WaMediaStatus } from './wa-types';
import {
  countsTowardQuota,
  generatedMediaFileName,
  mediaExt,
  resolveMediaUrlTtlSeconds,
  revokeMediaDeletedBy,
  safeWaMessageId,
} from './wa-media.util';

const PART_SIZE_BYTES = 8 * 1024 * 1024;
const UPLOAD_QUEUE_SIZE = 2;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

// Meta sends the hash base64 in webhooks; hex is accepted too, and 64 hex chars never decode to 32 base64 bytes.
export function sha256Matches(digest: Buffer, expected: string): boolean {
  const value = expected.trim();
  const decoded = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  return decoded.length === digest.length && decoded.equals(digest);
}

function mediaObjectKey(row: WhatsappMessage, mime: string): string {
  return [
    'whatsapp',
    row.companyId,
    row.userId,
    safeWaMessageId(row.chatId),
    `${safeWaMessageId(row.waMessageId)}.${mediaExt(row.mediaFileName, mime)}`,
  ].join('/');
}

function describeError(err: unknown): string {
  const code =
    err instanceof WhatsappMediaFetchError && err.graphCode !== undefined
      ? ` (graph code ${err.graphCode})`
      : '';
  return `${errorMessage(err)}${code}`;
}

// The row stays PENDING and resumes when the agent reconnects, so no attempt is spent waiting.
export class WaMediaAwaitingConnectionError extends UnrecoverableError {}

interface UploadedMedia {
  digest: Buffer;
  bytes: number;
}

// Hashes and counts the bytes on their way to the bucket.
function createHashingMeter(): {
  meter: Transform;
  result: () => UploadedMedia;
} {
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  return { meter, result: () => ({ digest: hash.digest(), bytes }) };
}

@Injectable()
export class WhatsappMediaIngestService {
  private readonly logger = new Logger(WhatsappMediaIngestService.name);
  private client: S3Client | null = null;

  constructor(
    private readonly store: MessageStoreService,
    private readonly cloudApi: WhatsappCloudApiService,
    private readonly gateway: WhatsappGateway,
    private readonly dataSource: DataSource,
    private readonly storagePurge: StoragePurgeService,
    private readonly media: WhatsappMediaService,
  ) {}

  // Idempotent: anything but a PENDING, undeleted row is already settled.
  async ingest(
    data: WaMediaJobData,
    attemptsMade: number,
    maxAttempts: number,
  ): Promise<void> {
    const row = await this.store.findRowByUuid(
      data.companyId,
      data.messageUuid,
    );
    if (row?.mediaStatus !== WaMediaStatus.PENDING) return;
    if (row.deletedAt) {
      // Also repaints the open chat.
      await this.media.deleteStoredMedia(
        row.companyId,
        row.id,
        revokeMediaDeletedBy(row.fromMe),
      );
      return;
    }

    let isStored: boolean;
    try {
      isStored = await this.storeMedia(row);
    } catch (err) {
      if (err instanceof WaMediaAwaitingConnectionError) {
        this.logger.warn(err.message);
      } else if (
        err instanceof UnrecoverableError ||
        attemptsMade + 1 >= maxAttempts
      ) {
        if (await this.markFailed(row, err)) await this.pushRow(row);
      }
      throw err;
    }
    if (isStored) await this.pushRow(row);
  }

  // False when the message was revoked while the file was uploading.
  private async storeMedia(row: WhatsappMessage): Promise<boolean> {
    const { token, info } = await this.describeMedia(row);
    const mime = row.mediaMime ?? info.mime_type ?? 'application/octet-stream';
    const key = mediaObjectKey(row, mime);
    const uploaded = await this.downloadToBucket(token, info.url, key, mime);
    await this.verifyHash(row, info, uploaded.digest, key);
    return this.finalise(row, key, uploaded.bytes, mime);
  }

  private async describeMedia(
    row: WhatsappMessage,
  ): Promise<{ token: string; info: WhatsappMediaInfo }> {
    const connection = await this.cloudApi.findConnected(
      row.companyId,
      row.userId,
    );
    const token = connection
      ? this.cloudApi.resolveAccessToken(connection)
      : null;
    if (!connection || !token) {
      throw new WaMediaAwaitingConnectionError(
        `No connected number or token for message ${row.id}; media stays PENDING until reconnect`,
      );
    }
    if (!row.mediaMetaId) {
      throw new UnrecoverableError(`No media id for message ${row.id}`);
    }
    // Every attempt asks again: the download url expires after 5 minutes.
    try {
      const info = await this.cloudApi.getMedia(
        connection,
        token,
        row.mediaMetaId,
      );
      return { token, info };
    } catch (err) {
      if (err instanceof WhatsappMediaFetchError && err.isMediaGone) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
  }

  private async downloadToBucket(
    token: string,
    url: string,
    key: string,
    mime: string,
  ): Promise<UploadedMedia> {
    const { meter, result } = createHashingMeter();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const res = await this.cloudApi.openMediaDownload(
        token,
        url,
        controller.signal,
      );
      const source = Readable.fromWeb(
        res.body as unknown as WebReadableStream<Uint8Array>,
      );
      const upload = new Upload({
        client: this.getClient(),
        params: {
          Bucket: getWhatsappBucket(),
          Key: key,
          Body: meter,
          ContentType: mime,
          CacheControl: `private, max-age=${resolveMediaUrlTtlSeconds()}`,
        },
        partSize: PART_SIZE_BYTES,
        queueSize: UPLOAD_QUEUE_SIZE,
      });
      // A failed upload stops reading the body, so the download is torn down here, not by the timer.
      const [download, uploadResult] = await Promise.allSettled([
        pipeline(source, meter),
        upload.done().catch((err: unknown) => {
          controller.abort();
          source.destroy(err instanceof Error ? err : new Error(String(err)));
          throw err;
        }),
      ]);
      if (uploadResult.status === 'rejected') throw uploadResult.reason;
      if (download.status === 'rejected') throw download.reason;
    } finally {
      clearTimeout(timer);
      // Releases the download socket when the upload failed first.
      controller.abort();
    }
    return result();
  }

  private async verifyHash(
    row: WhatsappMessage,
    info: WhatsappMediaInfo,
    digest: Buffer,
    key: string,
  ): Promise<void> {
    const expected = row.mediaSha256 ?? info.sha256;
    if (!expected) {
      this.logger.warn(`No sha256 from Meta for message ${row.id}; unverified`);
      return;
    }
    if (sha256Matches(digest, expected)) return;
    // Removes only this job's own write; the retry downloads again under the same key.
    try {
      await this.getClient().send(
        new DeleteObjectCommand({ Bucket: getWhatsappBucket(), Key: key }),
      );
    } catch (err) {
      this.logger.error(
        `Failed to delete mismatched media ${key}`,
        errorMessage(err, true),
      );
    }
    throw new Error(`sha256 mismatch for message ${row.id}`);
  }

  // The row lock orders this against a revoke: STORED and quota land together, or the upload is purged.
  private async finalise(
    row: WhatsappMessage,
    key: string,
    bytes: number,
    mime: string,
  ): Promise<boolean> {
    let purgeIds: string[] = [];
    const isStored = await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(WhatsappMessage, {
        where: { companyId: row.companyId, id: row.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        current?.mediaStatus === WaMediaStatus.PENDING &&
        !current.deletedAt
      ) {
        await this.recordStored(manager, row, key, bytes, mime);
        return true;
      }
      // Quota was never incremented for this upload, so nothing is released.
      purgeIds = await this.storagePurge.purge(manager, {
        whatsapp: [
          { companyId: row.companyId, s3Key: key, bytes: 0, sourceId: row.id },
        ],
      });
      if (current?.mediaStatus === WaMediaStatus.PENDING) {
        await manager.update(
          WhatsappMessage,
          { companyId: row.companyId, id: row.id },
          {
            mediaStatus: WaMediaStatus.DELETED,
            mediaDeletedAt: new Date(),
            mediaDeletedBy: revokeMediaDeletedBy(current.fromMe),
          },
        );
      }
      return false;
    });
    await this.storagePurge.dispatch(purgeIds);
    return isStored;
  }

  private async recordStored(
    manager: EntityManager,
    row: WhatsappMessage,
    key: string,
    bytes: number,
    mime: string,
  ): Promise<void> {
    await manager.update(
      WhatsappMessage,
      { companyId: row.companyId, id: row.id },
      {
        mediaKey: key,
        mediaSizeBytes: bytes,
        mediaMime: mime,
        mediaStatus: WaMediaStatus.STORED,
        mediaStoredAt: new Date(),
        ...(row.mediaFileName
          ? {}
          : {
              mediaFileName: generatedMediaFileName(
                row.mediaType,
                row.waMessageId,
                mime,
              ),
            }),
      },
    );
    if (countsTowardQuota(row.mediaType)) {
      await addStorageUsage(
        manager.getRepository(Company),
        row.companyId,
        bytes,
      );
    }
  }

  // True when this call wrote FAILED.
  private async markFailed(
    row: WhatsappMessage,
    cause: unknown,
  ): Promise<boolean> {
    this.logger.error(
      `Media of message ${row.id} failed for good: ${describeError(cause)}`,
    );
    try {
      const landed = await this.store.markPendingMediaFailed(
        row.companyId,
        row.id,
      );
      if (!landed) {
        this.logger.warn(
          `Media of message ${row.id} was settled before FAILED could be written`,
        );
      }
      return landed;
    } catch (err) {
      this.logger.error(
        `Failed to mark media FAILED for message ${row.id}`,
        errorMessage(err, true),
      );
      return false;
    }
  }

  private async pushRow(row: WhatsappMessage): Promise<void> {
    try {
      const message = await this.store.getMessageByUuid(row.companyId, row.id);
      if (message) this.gateway.emitMessageUpdate(row.userId, message);
    } catch (err) {
      this.logger.error(
        `Failed to push the media state of message ${row.id}`,
        errorMessage(err, true),
      );
    }
  }

  private getClient(): S3Client {
    this.client ??= buildWhatsappClient();
    return this.client;
  }
}
