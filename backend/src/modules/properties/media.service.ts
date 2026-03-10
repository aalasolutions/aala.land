import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignedUrlDto } from './dto/presigned-url.dto';

export interface PresignedUrlResult {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  expiresIn: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private s3Client: S3Client | null = null;

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

  async getPresignedUploadUrl(companyId: string, dto: PresignedUrlDto): Promise<PresignedUrlResult> {
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) {
      throw new BadRequestException('AWS_S3_BUCKET is not configured.');
    }

    const ext = dto.fileName.split('.').pop() ?? 'bin';
    const timestamp = Date.now();
    const key = `companies/${companyId}/properties/${dto.unitId ?? 'general'}/${timestamp}-${dto.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const expiresIn = 300;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: dto.contentType,
    });

    const client = this.getClient();
    const uploadUrl = await getSignedUrl(client, command, { expiresIn });

    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.AWS_REGION ?? 'us-east-1';
    const fileUrl = endpoint
      ? `${endpoint}/${bucket}/${key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    this.logger.log(`Generated presigned URL for ${key}`);

    return { uploadUrl, fileUrl, key, expiresIn };
  }
}
