import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { PropertyMedia, MediaType } from './entities/property-media.entity';
import { Unit } from './entities/unit.entity';
import { Asset } from './entities/asset.entity';
import { Company } from '../companies/entities/company.entity';
import { UploadMediaDto } from './dto/upload-media.dto';
import { reserveStorage } from '@shared/utils/storage-quota.util';
import sharp from 'sharp';
// file-type v21 is pure ESM. Dynamic import() is required from a CommonJS NestJS context.

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5 MB hard cap
const MAX_IMAGE_DIMENSION = 10_000;          // decompression bomb guard
const MAX_OUTPUT_DIMENSION = 2560;           // longest dimension cap for stored original
const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 400;

export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export interface DocumentUploadResult {
  url: string;
  s3Key: string;
  fileSize: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private s3Client: S3Client | null = null;

  constructor(
    @InjectRepository(PropertyMedia)
    private readonly mediaRepository: Repository<PropertyMedia>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(Asset)
    private readonly assetRepository: Repository<Asset>,
  ) {}

  // S3 plumbing

  private getClient(): S3Client {
    if (!this.s3Client) {
      const region = process.env.AWS_REGION ?? 'us-east-005';
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      const endpoint = process.env.S3_ENDPOINT;

      if (!accessKeyId || !secretAccessKey) {
        throw new BadRequestException(
          'S3 is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
        );
      }

      this.s3Client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      });
    }
    return this.s3Client;
  }

  private getBucket(): string {
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) throw new BadRequestException('AWS_S3_BUCKET is not configured.');
    return bucket;
  }

  private buildFileUrl(key: string): string {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = this.getBucket();
    const region = process.env.AWS_REGION ?? 'us-east-005';
    return endpoint
      ? `${endpoint}/${bucket}/${key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  private getThumbnailKey(originalKey: string): string {
    const parts = originalKey.split('/');
    const fileName = parts.pop();
    if (!fileName) {
      throw new InternalServerErrorException(
        'Invalid S3 key format: empty filename segment',
      );
    }
    return [...parts, 'thumbs', `thumb-${fileName}`].join('/');
  }

  // Storage counter helpers

  async decrementStorage(companyId: string, bytes: number): Promise<void> {
    if (bytes <= 0) return;
    await this.companyRepository
      .createQueryBuilder()
      .update(Company)
      .set({
        storageUsedBytes: () => 'GREATEST("storage_used_bytes" - :bytes, 0)',
      })
      .setParameter('bytes', bytes)
      .where('id = :companyId', { companyId })
      .execute();
  }

  // Ownership verification

  private async verifyUnitOwnership(
    unitId: string,
    companyId: string,
  ): Promise<void> {
    const unit = await this.unitRepository.findOne({ where: { id: unitId, companyId } });
    if (!unit) {
      throw new NotFoundException(
        'Unit not found or does not belong to this company',
      );
    }
  }

  private async verifyAssetOwnership(
    assetId: string,
    companyId: string,
  ): Promise<void> {
    // Assets are shared (community-seeded); no companyId on Asset entity.
    // Verify company has at least one unit whose assetId (DB: building_id) matches.
    // Unit.assetId maps to DB column building_id (unit.entity.ts line 22).
    const unit = await this.unitRepository.findOne({ where: { assetId, companyId } });
    if (!unit) {
      throw new NotFoundException(
        'Asset not found or company has no units in this asset',
      );
    }
  }

  // Image upload (primary scope)

  async uploadImage(
    companyId: string,
    file: Express.Multer.File,
    dto: UploadMediaDto,
  ): Promise<PropertyMedia> {
    // 1. Require exactly one of unitId or assetId.
    if (!dto.unitId && !dto.assetId) {
      throw new BadRequestException('Either unitId or assetId is required.');
    }

    // 2. Validate content-type against allowlist (client-supplied MIME).
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. ` +
        `Accepted: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
      );
    }

    // 3. Secondary size check. Multer limit is the primary gate.
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image must be under 5 MB. ` +
        `Received ${(file.size / 1_048_576).toFixed(1)} MB.`,
      );
    }

    // 4. Magic byte validation (file-type v21, pure ESM, dynamic import required).
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

    // 5. Verify ownership.
    if (dto.unitId) {
      await this.verifyUnitOwnership(dto.unitId, companyId);
    } else if (dto.assetId) {
      await this.verifyAssetOwnership(dto.assetId, companyId);
    }

    // 6. Decompression bomb check (header read only, no full pixel decode).
    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.buffer).metadata();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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

    // 7. Process with sharp.
    //    Original: rotate() corrects orientation and strips EXIF, resize() caps the
    //    longest dimension at 2560 px (never upscales). All images are re-encoded
    //    as JPEG at quality 80 — PNG/WebP inputs lose transparency (flattened to white).
    //    Thumbnail: 400x400 cover crop, JPEG quality 80.
    //    Both are generated from the raw in-memory buffer; B2 is never re-downloaded.
    let processedBuffer: Buffer;
    let thumbnailBuffer: Buffer;
    try {
      processedBuffer = await sharp(file.buffer)
        .rotate()
        .resize(MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
      thumbnailBuffer = await sharp(file.buffer)
        .rotate()
        .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Image processing failed: ${msg}`);
    }

    const actualOriginalBytes = processedBuffer.length;
    const actualThumbBytes    = thumbnailBuffer.length;
    const totalActualBytes    = actualOriginalBytes + actualThumbBytes;

    // 8. Atomically reserve storage using actual post-processing bytes (more accurate
    //    than raw file.size, which excludes the thumbnail and may differ from the JPEG
    //    output). Reserving before any S3 PUT closes the TOCTOU gap between the quota
    //    check and the counter update — the check and increment are one conditional
    //    UPDATE, so concurrent uploads cannot both pass and overshoot the quota.
    await reserveStorage(this.companyRepository, companyId, totalActualBytes);

    // 9. Build S3 keys. safeName truncated to 200 chars to stay under s3Key varchar(500).
    const timestamp  = Date.now();
    const safeName   = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 200);
    const folder      = dto.unitId ?? dto.assetId!;
    const originalKey = `companies/${companyId}/properties/${folder}/${timestamp}-${safeName}`;
    const thumbKey    = this.getThumbnailKey(originalKey);

    // 10. Upload original and thumbnail to B2.
    //     Output is always JPEG regardless of input format — record it as such.
    const client = this.getClient();
    const bucket = this.getBucket();
    let originalUploaded = false;

    try {
      await client.send(
        new PutObjectCommand({
          Bucket:        bucket,
          Key:           originalKey,
          Body:          processedBuffer,
          ContentType:   'image/jpeg',
          ContentLength: actualOriginalBytes,
        }),
      );
      originalUploaded = true;

      // 11. Upload thumbnail. If this fails, roll back the original.
      await client.send(
        new PutObjectCommand({
          Bucket:        bucket,
          Key:           thumbKey,
          Body:          thumbnailBuffer,
          ContentType:   'image/jpeg',
          ContentLength: actualThumbBytes,
        }),
      );
    } catch (uploadErr) {
      if (originalUploaded) {
        await client
          .send(new DeleteObjectCommand({ Bucket: bucket, Key: originalKey }))
          .catch((rollbackErr) => {
            this.logger.error(
              `Orphaned B2 object after thumbnail PUT failure. Manual cleanup required. ` +
              `key=${originalKey} rollbackError=` +
              (rollbackErr instanceof Error
                ? rollbackErr.message
                : String(rollbackErr)),
            );
          });
      }
      // Release the reservation made in step 8 — no bytes actually landed in storage.
      await this.decrementStorage(companyId, totalActualBytes).catch((e) => {
        this.logger.error(`Failed to release storage reservation for company ${companyId}: ${e instanceof Error ? e.message : String(e)}`);
      });
      const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      throw new InternalServerErrorException(`Storage upload failed: ${msg}`);
    }

    // 12. Save media record. Output is always JPEG — store the actual content type.
    //     PropertyMedia.assetId persists to building_id column (intentional legacy naming).
    const media = this.mediaRepository.create({
      url:           this.buildFileUrl(originalKey),
      thumbnailUrl:  this.buildFileUrl(thumbKey),
      fileName:      file.originalname,
      s3Key:         originalKey,
      contentType:   'image/jpeg',
      fileSize:      actualOriginalBytes,
      thumbnailSize: actualThumbBytes,
      type:          dto.type ?? MediaType.IMAGE,
      isPrimary:     dto.isPrimary ?? false,
      unitId:        dto.unitId,
      assetId:       dto.assetId,
      companyId,
    });

    try {
      return await this.mediaRepository.save(media);
    } catch (dbErr) {
      // Roll back S3 objects and storage counter since the DB record was never persisted.
      await this.decrementStorage(companyId, totalActualBytes).catch((e) => {
        this.logger.error(`Failed to decrement storage after DB failure for company ${companyId}: ${e instanceof Error ? e.message : String(e)}`);
      });
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: originalKey })).catch(() => {});
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbKey })).catch(() => {});
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      throw new InternalServerErrorException(`Failed to save media record: ${msg}`);
    }
  }

  // Document upload to storage (secondary scope)

  async uploadDocumentToStorage(
    companyId: string,
    file: Express.Multer.File,
  ): Promise<DocumentUploadResult> {
    // 1. MIME allowlist check (client-supplied header).
    if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. ` +
        `Accepted: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`,
      );
    }

    // 2. Magic-byte validation — confirms file bytes match the declared MIME type.
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(file.buffer);
    // PDFs and Office formats have recognisable magic bytes; plain text/CSV do not.
    // Only reject when file-type detects a type that conflicts with the declared MIME.
    if (detected && !(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(detected.mime)) {
      throw new BadRequestException(
        `File content does not match an allowed document type. ` +
        `Detected: ${detected.mime}. Accepted: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`,
      );
    }

    // 3. Atomically reserve storage before any S3 PUT (TOCTOU-safe — see
    //    reserveStorage). Closing this gap here mirrors the fix in uploadImage.
    await reserveStorage(this.companyRepository, companyId, file.size);

    const client = this.getClient();
    const bucket = this.getBucket();
    const timestamp = Date.now();
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 200);
    const key = `companies/${companyId}/documents/${timestamp}-${safeName}`;

    try {
      await client.send(
        new PutObjectCommand({
          Bucket:             bucket,
          Key:                key,
          Body:               file.buffer,
          ContentType:        file.mimetype,
          ContentLength:      file.size,
          ContentDisposition: `attachment; filename="${file.originalname.replace(/"/g, '_')}"`,
        }),
      );
    } catch (err) {
      // Release the reservation — no bytes actually landed in storage.
      await this.decrementStorage(companyId, file.size).catch((e) => {
        this.logger.error(`Failed to release storage reservation for company ${companyId}: ${e instanceof Error ? e.message : String(e)}`);
      });
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Document upload failed: ${msg}`);
    }

    return { url: this.buildFileUrl(key), s3Key: key, fileSize: file.size };
  }

  // Find and set-primary

  async findByUnit(companyId: string, unitId: string): Promise<PropertyMedia[]> {
    return this.mediaRepository.find({
      where: { companyId, unitId },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  async findByAsset(companyId: string, assetId: string): Promise<PropertyMedia[]> {
    return this.mediaRepository.find({
      where: { companyId, assetId },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  async setPrimary(id: string, companyId: string): Promise<PropertyMedia> {
    const media = await this.mediaRepository.findOne({ where: { id, companyId } });
    if (!media) throw new NotFoundException('Media not found');

    if (media.unitId) {
      await this.mediaRepository.update(
        { companyId, unitId: media.unitId },
        { isPrimary: false },
      );
    } else if (media.assetId) {
      await this.mediaRepository.update(
        { companyId, assetId: media.assetId },
        { isPrimary: false },
      );
    }

    media.isPrimary = true;
    return this.mediaRepository.save(media);
  }

  // Delete

  async deleteMedia(id: string, companyId: string): Promise<void> {
    const media = await this.mediaRepository.findOne({ where: { id, companyId } });
    if (!media) throw new NotFoundException('Media not found');

    const client = this.getClient();
    const bucket = this.getBucket();
    let bytesFreed = 0;

    if (media.s3Key) {
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: media.s3Key }),
        );
        bytesFreed += media.fileSize ?? 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to delete B2 object ${media.s3Key}: ${msg}`);
        throw new InternalServerErrorException(`Could not delete file from storage: ${msg}`);
      }

      const thumbKey = this.getThumbnailKey(media.s3Key);
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: thumbKey }),
        );
        bytesFreed += media.thumbnailSize ?? 0;
      } catch (err) {
        // Thumbnail delete failure is non-fatal — log and continue.
        this.logger.warn(
          `Failed to delete thumbnail ${thumbKey}: ` +
          (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    await this.mediaRepository.remove(media);

    if (bytesFreed > 0) {
      this.decrementStorage(companyId, bytesFreed).catch((err) => {
        this.logger.error(
          `Failed to decrement storage on media delete for company ${companyId}: ` +
          (err instanceof Error ? err.message : String(err)),
        );
      });
    }
  }

  async deleteDocumentFromStorage(
    s3Key: string | null,
    companyId: string,
    fileSize: number | null,
  ): Promise<void> {
    if (!s3Key) return;

    const client = this.getClient();
    const bucket = this.getBucket();

    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }),
      );
      if (fileSize && fileSize > 0) {
        this.decrementStorage(companyId, fileSize).catch((err) => {
          this.logger.error(
            `Failed to decrement storage on document delete for company ${companyId}: ` +
            (err instanceof Error ? err.message : String(err)),
          );
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to delete document B2 object ${s3Key}: ${msg}`);
      throw new InternalServerErrorException(`Could not delete document from storage: ${msg}`);
    }
  }
}
