import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { CreateMediaDto } from './dto/create-media.dto';
import { PropertyMedia } from './entities/property-media.entity';
import sharp from 'sharp';

export interface PresignedUrlResult {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  expiresIn: number;
}

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 400;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private s3Client: S3Client | null = null;

  constructor(
    @InjectRepository(PropertyMedia)
    private readonly mediaRepository: Repository<PropertyMedia>,
  ) {}

  private getClient(): S3Client {
    if (!this.s3Client) {
      const region = process.env.AWS_REGION ?? 'us-east-1';
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      const endpoint = process.env.S3_ENDPOINT;

      if (!accessKeyId || !secretAccessKey) {
        throw new BadRequestException('S3 is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
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
    if (!bucket) {
      throw new BadRequestException('AWS_S3_BUCKET is not configured.');
    }
    return bucket;
  }

  private buildFileUrl(key: string): string {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = this.getBucket();
    const region = process.env.AWS_REGION ?? 'us-east-1';
    return endpoint
      ? `${endpoint}/${bucket}/${key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  async getPresignedUploadUrl(companyId: string, dto: PresignedUrlDto): Promise<PresignedUrlResult> {
    const bucket = this.getBucket();
    const timestamp = Date.now();
    const safeName = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const folder = dto.unitId ? dto.unitId : 'general';
    const key = `companies/${companyId}/properties/${folder}/${timestamp}-${safeName}`;
    const expiresIn = 300;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: dto.contentType,
    });

    const client = this.getClient();
    const uploadUrl = await getSignedUrl(client, command, { expiresIn });
    const fileUrl = this.buildFileUrl(key);

    this.logger.log(`Generated presigned URL for ${key}`);

    return { uploadUrl, fileUrl, key, expiresIn };
  }

  async getDocumentPresignedUrl(companyId: string, dto: PresignedUrlDto): Promise<PresignedUrlResult> {
    const bucket = this.getBucket();
    const timestamp = Date.now();
    const safeName = dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `companies/${companyId}/documents/${timestamp}-${safeName}`;
    const expiresIn = 300;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: dto.contentType,
    });

    const client = this.getClient();
    const uploadUrl = await getSignedUrl(client, command, { expiresIn });
    const fileUrl = this.buildFileUrl(key);

    this.logger.log(`Generated document presigned URL for ${key}`);

    return { uploadUrl, fileUrl, key, expiresIn };
  }

  async createMedia(companyId: string, dto: CreateMediaDto): Promise<PropertyMedia> {
    const media = this.mediaRepository.create({
      ...dto,
      companyId,
    });
    const saved = await this.mediaRepository.save(media);

    // Generate thumbnail for images
    const isImage = dto.contentType?.startsWith('image/');
    if (isImage && dto.s3Key) {
      this.generateThumbnail(saved.id, dto.s3Key).catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Thumbnail generation failed for ${saved.id}: ${message}`);
      });
    }

    return saved;
  }

  async findByUnit(companyId: string, unitId: string): Promise<PropertyMedia[]> {
    return this.mediaRepository.find({
      where: { companyId, unitId },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  async findByBuilding(companyId: string, buildingId: string): Promise<PropertyMedia[]> {
    return this.mediaRepository.find({
      where: { companyId, buildingId },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  async setPrimary(id: string, companyId: string): Promise<PropertyMedia> {
    const media = await this.mediaRepository.findOne({ where: { id, companyId } });
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Unset all other primary for same unit/building
    if (media.unitId) {
      await this.mediaRepository.update(
        { companyId, unitId: media.unitId },
        { isPrimary: false },
      );
    } else if (media.buildingId) {
      await this.mediaRepository.update(
        { companyId, buildingId: media.buildingId },
        { isPrimary: false },
      );
    }

    media.isPrimary = true;
    return this.mediaRepository.save(media);
  }

  async deleteMedia(id: string, companyId: string): Promise<void> {
    const media = await this.mediaRepository.findOne({ where: { id, companyId } });
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    const bucket = this.getBucket();
    const client = this.getClient();

    // Delete original from S3
    if (media.s3Key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: media.s3Key }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to delete S3 object ${media.s3Key}: ${message}`);
      }
    }

    // Delete thumbnail from S3
    if (media.thumbnailUrl && media.s3Key) {
      const thumbKey = this.getThumbnailKey(media.s3Key);
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbKey }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to delete thumbnail ${thumbKey}: ${message}`);
      }
    }

    await this.mediaRepository.remove(media);
  }

  private getThumbnailKey(originalKey: string): string {
    const parts = originalKey.split('/');
    const fileName = parts.pop();
    return [...parts, 'thumbs', `thumb-${fileName}`].join('/');
  }

  private async generateThumbnail(mediaId: string, s3Key: string): Promise<void> {
    const bucket = this.getBucket();
    const client = this.getClient();

    // Download original
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
    const response = await client.send(getCmd);

    if (!response.Body) {
      this.logger.warn(`No body in S3 response for ${s3Key}`);
      return;
    }

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    const originalBuffer = Buffer.concat(chunks);

    // Generate thumbnail with sharp
    const thumbnailBuffer = await sharp(originalBuffer)
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
        fit: 'cover',
        position: 'centre',
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Upload thumbnail
    const thumbKey = this.getThumbnailKey(s3Key);
    const putCmd = new PutObjectCommand({
      Bucket: bucket,
      Key: thumbKey,
      Body: thumbnailBuffer,
      ContentType: 'image/jpeg',
    });
    await client.send(putCmd);

    // Update media record with thumbnail URL
    const thumbnailUrl = this.buildFileUrl(thumbKey);
    await this.mediaRepository.update(mediaId, { thumbnailUrl });

    this.logger.log(`Thumbnail generated: ${thumbKey}`);
  }
}
