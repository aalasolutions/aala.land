import 'reflect-metadata';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { AppDataSource } from '../../data-source';
import { PropertyDocument } from '../../modules/properties/entities/property-document.entity';
import { BUCKET_ROOT_FOLDER } from '../../modules/properties/media.service';

// One-off migration: moves every document object out of the old public bucket
// (AWS_S3_BUCKET) into the new private documents bucket (AWS_S3_DOCUMENTS_BUCKET),
// and prefixes the key with the shared `land/` root folder. Updates each row's
// s3Key/url to the new location. Safe to re-run — each document is skipped once
// it's confirmed present at the new key in the destination bucket, and the old
// object is only deleted after the copy is confirmed. Run with --dry-run first.

const DRY_RUN = process.argv.includes('--dry-run');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function buildClient(): S3Client {
  const region = process.env.AWS_REGION ?? 'us-east-005';
  const endpoint = process.env.S3_ENDPOINT;
  return new S3Client({
    region,
    credentials: {
      accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

function buildFileUrl(bucket: string, key: string): string {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.AWS_REGION ?? 'us-east-005';
  return endpoint
    ? `${endpoint}/${bucket}/${key}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

// The DB may already hold a `land/`-prefixed key if a prior run got as far as the
// object move but was interrupted before the DB update. Always derive the old
// bucket's (unprefixed) key from the DB value so re-runs stay idempotent.
function resolveKeys(storedKey: string): { sourceKey: string; destKey: string } {
  const prefix = `${BUCKET_ROOT_FOLDER}/`;
  const hasPrefix = storedKey.startsWith(prefix);
  return {
    sourceKey: hasPrefix ? storedKey.slice(prefix.length) : storedKey,
    destKey: hasPrefix ? storedKey : `${prefix}${storedKey}`,
  };
}

async function objectExists(client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function migrateOne(
  client: S3Client,
  sourceBucket: string,
  destBucket: string,
  sourceKey: string,
  destKey: string,
): Promise<'migrated' | 'already-done' | 'skipped-missing' | 'dry-run-would-move'> {
  if (await objectExists(client, destBucket, destKey)) {
    return 'already-done';
  }

  if (DRY_RUN) {
    const existsInSource = await objectExists(client, sourceBucket, sourceKey);
    return existsInSource ? 'dry-run-would-move' : 'skipped-missing';
  }

  const source = await client
    .send(new GetObjectCommand({ Bucket: sourceBucket, Key: sourceKey }))
    .catch(() => null);

  if (!source?.Body) {
    return 'skipped-missing';
  }

  const body = await source.Body.transformToByteArray();

  await client.send(
    new PutObjectCommand({
      Bucket: destBucket,
      Key: destKey,
      Body: Buffer.from(body),
      ContentType: source.ContentType,
      ContentDisposition: source.ContentDisposition,
      ContentLength: body.length,
    }),
  );

  // Only delete the source once the destination copy is confirmed present.
  await client.send(new DeleteObjectCommand({ Bucket: sourceBucket, Key: sourceKey }));

  return 'migrated';
}

async function main(): Promise<void> {
  const sourceBucket = requireEnv('AWS_S3_BUCKET');
  const destBucket = requireEnv('AWS_S3_DOCUMENTS_BUCKET');

  if (sourceBucket === destBucket) {
    throw new Error('AWS_S3_BUCKET and AWS_S3_DOCUMENTS_BUCKET must be different buckets.');
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Migrating documents: ${sourceBucket} -> ${destBucket}`);

  await AppDataSource.initialize();
  const client = buildClient();

  const documents = await AppDataSource.getRepository(PropertyDocument)
    .createQueryBuilder('doc')
    .where('doc.s3Key IS NOT NULL')
    .getMany();

  console.log(`Found ${documents.length} document(s) with an s3Key to check.`);

  const counts = { migrated: 0, 'already-done': 0, 'skipped-missing': 0, 'dry-run-would-move': 0 };
  const failures: Array<{ id: string; s3Key: string; error: string }> = [];
  const documentRepo = AppDataSource.getRepository(PropertyDocument);

  for (const doc of documents) {
    const { sourceKey, destKey } = resolveKeys(doc.s3Key as string);
    try {
      const result = await migrateOne(client, sourceBucket, destBucket, sourceKey, destKey);
      counts[result] += 1;
      console.log(`[${result}] ${doc.id} — ${sourceKey} -> ${destKey}`);

      // Point the DB row at the new location once the object is confirmed at destKey.
      if ((result === 'migrated' || result === 'already-done') && !DRY_RUN) {
        await documentRepo.update(doc.id, {
          s3Key: destKey,
          url: buildFileUrl(destBucket, destKey),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ id: doc.id, s3Key: sourceKey, error: message });
      console.error(`[failed] ${doc.id} — ${sourceKey}: ${message}`);
    }
  }

  await AppDataSource.destroy();

  console.log('\n--- Summary ---');
  console.log(`Total candidates:   ${documents.length}`);
  console.log(`Migrated:           ${counts.migrated}`);
  console.log(`Already done:       ${counts['already-done']}`);
  console.log(`Skipped (missing):  ${counts['skipped-missing']}`);
  if (DRY_RUN) {
    console.log(`Would move:         ${counts['dry-run-would-move']}`);
  }
  console.log(`Failed:             ${failures.length}`);
  if (failures.length > 0) {
    console.log('\nFailures (re-run this script to retry — it is idempotent):');
    failures.forEach((f) => console.log(`  - ${f.id} (${f.s3Key}): ${f.error}`));
  }
}

main().catch((err) => {
  console.error('Migration script failed:', err);
  process.exit(1);
});
