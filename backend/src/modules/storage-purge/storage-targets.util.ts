import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';

export interface StorageTarget {
  client: S3Client;
  bucket: string;
}

export function buildS3Client(
  accessKeyId: string | undefined,
  secretAccessKey: string | undefined,
  label: string,
): S3Client {
  if (!accessKeyId || !secretAccessKey) {
    throw new BadRequestException(`S3 is not configured. Set ${label}.`);
  }
  const region = process.env.AWS_REGION ?? 'us-east-005';
  const endpoint = process.env.S3_ENDPOINT;
  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

// Each bucket is paired with its own credentials to avoid using the wrong key
export function buildMediaClient(): S3Client {
  return buildS3Client(
    process.env.AWS_ACCESS_KEY_ID,
    process.env.AWS_SECRET_ACCESS_KEY,
    'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
  );
}

export function buildDocumentsClient(): S3Client {
  return buildS3Client(
    process.env.AWS_DOCUMENTS_ACCESS_KEY_ID,
    process.env.AWS_DOCUMENTS_SECRET_ACCESS_KEY,
    'AWS_DOCUMENTS_ACCESS_KEY_ID and AWS_DOCUMENTS_SECRET_ACCESS_KEY',
  );
}

// Public, property photos/thumbnails only.
export function getMediaBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket)
    throw new BadRequestException('AWS_S3_BUCKET is not configured.');
  return bucket;
}

// Private, documents only; served exclusively through DocumentsService.downloadStream
export function getDocumentsBucket(): string {
  const bucket = process.env.AWS_S3_DOCUMENTS_BUCKET;
  if (!bucket)
    throw new BadRequestException('AWS_S3_DOCUMENTS_BUCKET is not configured.');
  return bucket;
}

export function getThumbnailKey(originalKey: string): string {
  const parts = originalKey.split('/');
  const fileName = parts.pop();
  if (!fileName) {
    throw new InternalServerErrorException(
      'Invalid S3 key format: empty filename segment',
    );
  }
  return [...parts, 'thumbs', `thumb-${fileName}`].join('/');
}
