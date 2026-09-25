import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { PropertyMedia, MediaType } from './entities/property-media.entity';
import { Unit } from './entities/unit.entity';
import { Asset } from './entities/asset.entity';
import { Company } from '../companies/entities/company.entity';
import { UploadMediaDto } from './dto/upload-media.dto';
import {
  getStorageQuotaBytes,
  releaseStorage,
  reserveStorage,
} from '@shared/utils/storage-quota.util';
import { ALLOWED_DOCUMENT_TYPES } from '@shared/constants/document-types';
import { verifyTextFile } from '@shared/utils/text-file.util';
import { errorMessage } from '@shared/utils/error.util';
import { envString } from '@shared/utils/env.util';
import { SystemEmailService } from '../email/system-email.service';
import { StoragePurgeService } from '../storage-purge/storage-purge.service';
import {
  buildDocumentsClient,
  buildMediaClient,
  getDocumentsBucket,
  getMediaBucket,
  getThumbnailKey,
} from '../storage-purge/storage-targets.util';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import sharp from 'sharp';
// file-type v21 is pure ESM. Dynamic import() is required from a CommonJS NestJS context.

// All object keys live under this root folder in every bucket (media + documents).
export const BUCKET_ROOT_FOLDER = 'land';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB hard cap
const MAX_IMAGE_DIMENSION = 10_000; // decompression bomb guard
const MAX_OUTPUT_DIMENSION = 2560; // longest dimension cap for stored original
const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 400;

export { ALLOWED_DOCUMENT_TYPES };

// No magic-byte signature exists for these; verifyTextFile checks them instead.
const TEXT_DOCUMENT_TYPES = new Set<string>([
  'text/plain',
  'text/markdown',
  'text/csv',
]);

export interface DocumentUploadResult {
  url: string;
  s3Key: string;
  fileSize: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private mediaClient: S3Client | null = null;
  private documentsClient: S3Client | null = null;

  constructor(
    @InjectRepository(PropertyMedia)
    private readonly mediaRepository: Repository<PropertyMedia>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
    private readonly systemEmail: SystemEmailService,
    private readonly dataSource: DataSource,
    private readonly storagePurge: StoragePurgeService,
  ) {}

  /** On over-quota rejection, notifies the company (best-effort, deduped 24h) then rethrows 507. */
  private async reserveStorageOrNotify(
    companyId: string,
    bytes: number,
  ): Promise<void> {
    try {
      await reserveStorage(this.companyRepository, companyId, bytes);
    } catch (err) {
      if (
        err instanceof HttpException &&
        err.getStatus() === HttpStatus.INSUFFICIENT_STORAGE
      ) {
        this.notifyStorageQuotaExceeded(companyId).catch((e) =>
          this.logger.error(
            `Quota email failed for company ${companyId}: ${errorMessage(e)}`,
          ),
        );
      }
      throw err;
    }
  }

  private async notifyStorageQuotaExceeded(companyId: string): Promise<void> {
    const claim = await this.companyRepository
      .createQueryBuilder()
      .update(Company)
      .set({ storageQuotaNotifiedAt: () => 'now()' })
      .where('id = :companyId', { companyId })
      .andWhere(
        "(storage_quota_notified_at IS NULL OR storage_quota_notified_at < now() - interval '24 hours')",
      )
      .execute();
    if (!claim.affected) return;

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) return;
    const quotaBytes = getStorageQuotaBytes(company);
    const gb = (n: number) => (n / (1024 * 1024 * 1024)).toFixed(2);
    await this.systemEmail.sendQuotaExceededToCompany(
      companyId,
      'storage',
      `You have used ${gb(Number(company.storageUsedBytes))} GB of your ${gb(quotaBytes)} GB storage.`,
    );
  }

  private getMediaClient(): S3Client {
    if (!this.mediaClient) {
      this.mediaClient = buildMediaClient();
    }
    return this.mediaClient;
  }

  private getDocumentsClient(): S3Client {
    if (!this.documentsClient) {
      this.documentsClient = buildDocumentsClient();
    }
    return this.documentsClient;
  }

  // Pairs each bucket with its own credentials to avoid using the wrong key
  private mediaTarget(): { client: S3Client; bucket: string } {
    return { client: this.getMediaClient(), bucket: getMediaBucket() };
  }

  private documentsTarget(): { client: S3Client; bucket: string } {
    return {
      client: this.getDocumentsClient(),
      bucket: getDocumentsBucket(),
    };
  }

  private buildFileUrl(bucket: string, key: string): string {
    const endpoint = envString('S3_ENDPOINT');
    const region = envString('AWS_REGION', 'us-east-005');
    return endpoint
      ? `${endpoint}/${bucket}/${key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  async decrementStorage(companyId: string, bytes: number): Promise<void> {
    await releaseStorage(this.companyRepository, companyId, bytes);
  }

  private async verifyUnitOwnership(
    unitId: string,
    companyId: string,
  ): Promise<void> {
    const unit = await this.unitRepository.findOne({
      where: { id: unitId, companyId },
    });
    if (!unit) {
      throw new NotFoundException(
        'Property not found or does not belong to this company',
      );
    }
    if (unit.deletedAt) {
      throw new ConflictException(
        'This unit is archived. Unarchive it before uploading photos.',
      );
    }
  }

  private async verifyAssetOwnership(
    assetId: string,
    companyId: string,
  ): Promise<void> {
    // Assets are shared (community-seeded); no companyId on Asset entity.
    const unit = await this.unitRepository.findOne({
      where: { assetId, companyId, deletedAt: IsNull() },
    });
    if (!unit) {
      throw new NotFoundException(
        'Asset not found or company has no units in this asset',
      );
    }
  }

  async uploadImage(
    companyId: string,
    file: Express.Multer.File,
    dto: UploadMediaDto,
  ): Promise<PropertyMedia> {
    if ((dto.unitId && dto.assetId) || (!dto.unitId && !dto.assetId)) {
      throw new BadRequestException(
        'Provide either unitId or assetId (but not both).',
      );
    }

    // Client-supplied header only; real content is verified against magic bytes below
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. ` +
          `Accepted: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
      );
    }

    // Secondary size check; the Multer limit is the primary gate.
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image must be under 5 MB. ` +
          `Received ${(file.size / 1_048_576).toFixed(1)} MB.`,
      );
    }

    // Magic-byte validation against the real file content, not just the declared MIME.
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(file.buffer);
    if (
      !detected ||
      !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(detected.mime)
    ) {
      throw new BadRequestException(
        `File content does not match an allowed image type. ` +
          `Detected: ${detected?.mime ?? 'unknown'}. ` +
          `Accepted: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
      );
    }

    if (dto.unitId) {
      await this.verifyUnitOwnership(dto.unitId, companyId);
    } else if (dto.assetId) {
      await this.verifyAssetOwnership(dto.assetId, companyId);
    }

    // Decompression bomb check: header read only, no full pixel decode.
    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.buffer).metadata();
    } catch (err) {
      const msg = errorMessage(err);
      throw new BadRequestException(`Cannot read image metadata: ${msg}`);
    }
    if (
      (meta.width ?? 0) > MAX_IMAGE_DIMENSION ||
      (meta.height ?? 0) > MAX_IMAGE_DIMENSION
    ) {
      throw new BadRequestException(
        `Image dimensions (${meta.width}x${meta.height}) exceed the ` +
          `${MAX_IMAGE_DIMENSION}px limit on either axis.`,
      );
    }

    // Both original and thumbnail come from the in-memory buffer; the bucket is never re-downloaded
    let processedBuffer: Buffer;
    let thumbnailBuffer: Buffer;
    try {
      processedBuffer = await sharp(file.buffer)
        .rotate()
        .resize(MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 80 })
        .toBuffer();
      thumbnailBuffer = await sharp(file.buffer)
        .rotate()
        .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
          fit: 'cover',
          position: 'centre',
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (err) {
      const msg = errorMessage(err);
      throw new BadRequestException(`Image processing failed: ${msg}`);
    }

    const actualOriginalBytes = processedBuffer.length;
    const actualThumbBytes = thumbnailBuffer.length;
    const totalActualBytes = actualOriginalBytes + actualThumbBytes;

    // Reserves actual post-processing bytes before the S3 PUT, closing the quota TOCTOU gap
    await this.reserveStorageOrNotify(companyId, totalActualBytes);

    // safeName truncated to 200 chars to stay under the s3Key varchar(500) column.
    const timestamp = Date.now();
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 200);
    const folder = dto.unitId ?? dto.assetId!;
    const originalKey = `${BUCKET_ROOT_FOLDER}/companies/${companyId}/properties/${folder}/${timestamp}-${safeName}`;
    const thumbKey = getThumbnailKey(originalKey);

    const { client, bucket } = this.mediaTarget();
    let originalUploaded = false;

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: originalKey,
          Body: processedBuffer,
          ContentType: 'image/jpeg',
          ContentLength: actualOriginalBytes,
        }),
      );
      originalUploaded = true;

      // If the thumbnail upload fails, the original upload is rolled back below.
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: thumbKey,
          Body: thumbnailBuffer,
          ContentType: 'image/jpeg',
          ContentLength: actualThumbBytes,
        }),
      );
    } catch (uploadErr) {
      if (originalUploaded) {
        await client
          .send(new DeleteObjectCommand({ Bucket: bucket, Key: originalKey }))
          .catch((rollbackErr) => {
            this.logger.error(
              `Orphaned bucket object after thumbnail PUT failure. Manual cleanup required. ` +
                `key=${originalKey} rollbackError=` +
                errorMessage(rollbackErr),
            );
          });
      }
      // Releases the reservation since no bytes actually landed in storage.
      await this.decrementStorage(companyId, totalActualBytes).catch((e) => {
        this.logger.error(
          `Failed to release storage reservation for company ${companyId}: ${errorMessage(e)}`,
        );
      });
      const msg = errorMessage(uploadErr);
      throw new InternalServerErrorException(`Storage upload failed: ${msg}`);
    }

    const media = this.mediaRepository.create({
      url: this.buildFileUrl(bucket, originalKey),
      thumbnailUrl: this.buildFileUrl(bucket, thumbKey),
      fileName: file.originalname,
      s3Key: originalKey,
      contentType: 'image/jpeg',
      fileSize: actualOriginalBytes,
      thumbnailSize: actualThumbBytes,
      // dto.type is ignored: this endpoint only ever stores a processed JPEG
      type: MediaType.IMAGE,
      isPrimary: dto.isPrimary ?? false,
      unitId: dto.unitId,
      assetId: dto.assetId,
      companyId,
    });

    try {
      return await this.dataSource.transaction(async (manager) => {
        if (dto.unitId) {
          const unit = await manager.findOne(Unit, {
            where: { id: dto.unitId, companyId },
            select: { id: true, deletedAt: true },
            lock: { mode: 'pessimistic_read' },
          });
          if (!unit) {
            throw new NotFoundException(
              'Property not found or does not belong to this company',
            );
          }
          if (unit.deletedAt) {
            throw new ConflictException(
              'This unit is archived. Unarchive it before uploading photos.',
            );
          }
        }
        return manager.getRepository(PropertyMedia).save(media);
      });
    } catch (dbErr) {
      // Roll back S3 objects and storage counter since the DB record was never persisted.
      await this.decrementStorage(companyId, totalActualBytes).catch((e) => {
        this.logger.error(
          `Failed to decrement storage after DB failure for company ${companyId}: ${errorMessage(e)}`,
        );
      });
      await client
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: originalKey }))
        .catch(() => {});
      await client
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbKey }))
        .catch(() => {});
      if (dbErr instanceof HttpException) {
        throw dbErr;
      }
      const msg = errorMessage(dbErr);
      throw new InternalServerErrorException(
        `Failed to save media record: ${msg}`,
      );
    }
  }

  async uploadDocumentToStorage(
    companyId: string,
    file: Express.Multer.File,
  ): Promise<DocumentUploadResult> {
    // Multer spools to a temp file on disk; must be removed on every exit path
    try {
      return await this.uploadDocumentFile(companyId, file);
    } finally {
      await unlink(file.path).catch((e) => {
        this.logger.error(
          `Failed to remove temp upload file ${file.path}: ${errorMessage(e)}`,
        );
      });
    }
  }

  private async uploadDocumentFile(
    companyId: string,
    file: Express.Multer.File,
  ): Promise<DocumentUploadResult> {
    // Client-supplied header only; content is verified against real bytes below
    if (
      !(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(file.mimetype)
    ) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. ` +
          `Accepted: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`,
      );
    }

    // Content validation confirms file bytes match the declared MIME type.
    if (TEXT_DOCUMENT_TYPES.has(file.mimetype)) {
      await verifyTextFile(file.path);
    } else {
      const { fileTypeFromFile } = await import('file-type');
      const detected = await fileTypeFromFile(file.path);
      if (!detected) {
        throw new BadRequestException(
          `File content could not be verified as "${file.mimetype}". ` +
            `Only genuine ${ALLOWED_DOCUMENT_TYPES.join(', ')} files are accepted.`,
        );
      }
      if (detected.mime !== file.mimetype) {
        throw new BadRequestException(
          `File content (${detected.mime}) does not match the declared type (${file.mimetype}).`,
        );
      }
    }

    // Reserves storage atomically before any S3 PUT, TOCTOU-safe like uploadImage's check.
    await this.reserveStorageOrNotify(companyId, file.size);

    const { client, bucket } = this.documentsTarget();
    const timestamp = Date.now();
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 200);
    const key = `${BUCKET_ROOT_FOLDER}/companies/${companyId}/documents/${timestamp}-${safeName}`;

    // An unlistened 'error' event on a Readable crashes the process
    const bodyStream = createReadStream(file.path);
    bodyStream.on('error', (err) => {
      this.logger.error(
        `Document upload stream error for ${file.path}: ${err.message}`,
      );
    });

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bodyStream,
          ContentType: file.mimetype,
          ContentLength: file.size,
          ContentDisposition: `attachment; filename="${file.originalname.replace(/"/g, '_')}"`,
        }),
      );
    } catch (err) {
      // Releases the reservation since no bytes actually landed in storage.
      await this.decrementStorage(companyId, file.size).catch((e) => {
        this.logger.error(
          `Failed to release storage reservation for company ${companyId}: ${errorMessage(e)}`,
        );
      });
      const msg = errorMessage(err);
      throw new InternalServerErrorException(`Document upload failed: ${msg}`);
    }

    return {
      url: this.buildFileUrl(bucket, key),
      s3Key: key,
      fileSize: file.size,
    };
  }

  /** Manual payment proof: image-only, no quota so an over-quota company can still pay. */
  async uploadConsoleReceipt(
    companyId: string,
    file: Express.Multer.File,
  ): Promise<{ s3Key: string; fileSize: number }> {
    try {
      const allowed: readonly string[] = [
        'image/jpeg',
        'image/png',
        'image/webp',
      ];
      if (!allowed.includes(file.mimetype)) {
        throw new BadRequestException(
          `Receipt must be an image (${allowed.join(', ')}); got "${file.mimetype}"`,
        );
      }
      const { fileTypeFromFile } = await import('file-type');
      const detected = await fileTypeFromFile(file.path);
      if (!detected || detected.mime !== file.mimetype) {
        throw new BadRequestException(
          `Receipt content (${detected?.mime ?? 'unknown'}) does not match the declared type (${file.mimetype}).`,
        );
      }

      const { client, bucket } = this.documentsTarget();
      const safeName = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 200);
      const key = `${BUCKET_ROOT_FOLDER}/companies/${companyId}/console-receipts/${Date.now()}-${safeName}`;

      const bodyStream = createReadStream(file.path);
      bodyStream.on('error', (err) => {
        this.logger.error(
          `Receipt upload stream error for ${file.path}: ${err.message}`,
        );
      });
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bodyStream,
            ContentType: file.mimetype,
            ContentLength: file.size,
          }),
        );
      } catch (err) {
        const msg = errorMessage(err);
        throw new InternalServerErrorException(`Receipt upload failed: ${msg}`);
      }
      return { s3Key: key, fileSize: file.size };
    } finally {
      await unlink(file.path).catch((e) => {
        this.logger.error(
          `Failed to remove temp receipt file ${file.path}: ${errorMessage(e)}`,
        );
      });
    }
  }

  async findByUnit(
    companyId: string,
    unitId: string,
  ): Promise<PropertyMedia[]> {
    return this.mediaRepository.find({
      where: { companyId, unitId },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  async findByAsset(
    companyId: string,
    assetId: string,
  ): Promise<PropertyMedia[]> {
    return this.mediaRepository.find({
      where: { companyId, assetId },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  async setPrimary(id: string, companyId: string): Promise<PropertyMedia> {
    const media = await this.mediaRepository.findOne({
      where: { id, companyId },
    });
    if (!media) throw new NotFoundException('Media not found');

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PropertyMedia);
      if (media.unitId) {
        const unit = await manager.findOne(Unit, {
          where: { id: media.unitId, companyId },
          select: { id: true, deletedAt: true },
          lock: { mode: 'pessimistic_read' },
        });
        if (!unit) {
          throw new NotFoundException(
            'Property not found or does not belong to this company',
          );
        }
        if (unit.deletedAt) {
          throw new ConflictException(
            'This unit is archived. Unarchive it before changing its photos.',
          );
        }
        await repo.update(
          { companyId, unitId: media.unitId },
          { isPrimary: false },
        );
      } else if (media.assetId) {
        await repo.update(
          { companyId, assetId: media.assetId },
          { isPrimary: false },
        );
      }

      media.isPrimary = true;
      return repo.save(media);
    });
  }

  async deleteMedia(id: string, companyId: string): Promise<void> {
    const purgeIds = await this.dataSource.transaction(async (manager) => {
      const media = await manager.findOne(PropertyMedia, {
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!media) throw new NotFoundException('Media not found');
      return this.storagePurge.purge(manager, { media: [media] });
    });
    void this.storagePurge.dispatch(purgeIds);
  }

  // Callers must go through DocumentsService.downloadStream, which re-checks accessLevel
  async getDocumentStream(s3Key: string): Promise<NodeJS.ReadableStream> {
    const { client, bucket } = this.documentsTarget();

    const result = await client
      .send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }))
      .catch((err) => {
        if (err instanceof Error && err.name === 'NoSuchKey') {
          throw new NotFoundException('Document not found in storage');
        }
        const msg = errorMessage(err);
        this.logger.error(
          `Failed to fetch document object ${s3Key}: ${msg}`,
        );
        throw new InternalServerErrorException(
          `Could not fetch document from storage: ${msg}`,
        );
      });

    if (!result.Body) {
      throw new NotFoundException('Document not found in storage');
    }
    return result.Body as NodeJS.ReadableStream;
  }
}
