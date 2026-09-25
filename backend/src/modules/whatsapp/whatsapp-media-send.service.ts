import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Role } from '@shared/enums/roles.enum';
import { errorMessage } from '@shared/utils/error.util';
import {
  releaseStorage,
  reserveStorage,
} from '@shared/utils/storage-quota.util';
import { verifyTextFile } from '@shared/utils/text-file.util';
import { Company } from '../companies/entities/company.entity';
import {
  buildWhatsappClient,
  getWhatsappBucket,
} from '../storage-purge/storage-targets.util';
import { WhatsappConnection } from './entities/whatsapp-connection.entity';
import { WhatsappMessageStatus } from './entities/whatsapp-message.entity';
import { MessageStoreService } from './message-store.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import {
  WhatsappCloudApiService,
  WhatsappSendError,
} from './whatsapp-cloud-api.service';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappService } from './whatsapp.service';
import {
  PART_SIZE_BYTES,
  UPLOAD_QUEUE_SIZE,
} from './whatsapp-media-ingest.service';
import { WA_LOCAL_ID_PREFIX, WaMediaStatus, WaMessage } from './wa-types';
import {
  WaOutboundMedia,
  WaOutboundMediaType,
  baseMime,
  countsTowardQuota,
  generatedMediaFileName,
  isVoiceNoteMedia,
  metaUploadMime,
  outboundObjectKey,
  outboundTextMime,
  resolveMediaUrlTtlSeconds,
  resolveOutboundMedia,
} from './wa-media.util';

const CAPTIONED_TYPES = new Set<WaOutboundMediaType>([
  'image',
  'video',
  'document',
]);
const RECONNECT_MESSAGE =
  'This WhatsApp connection needs reconnecting; the file was not sent';
const MAX_FILE_NAME_LENGTH = 200;
const MAX_WEBP_CHUNKS = 32;

export interface WaMediaSendOptions {
  caption?: string;
  voice?: boolean;
}

interface DeliveryFile {
  path: string;
  type: WaOutboundMediaType;
  mime: string;
  uploadMime: string;
  fileName: string;
  caption: string;
  voice: boolean;
}

// Browsers send UTF-8 names that busboy decodes as latin1; bytes that are not valid UTF-8 stay as they are.
function originalFileName(name: string): string {
  let decoded = name;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.from(name, 'latin1'),
    );
  } catch {
    decoded = name;
  }
  return decoded
    .replace(/[\p{Cc}/\\]/gu, '_')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH);
}

// An animated WebP carries an ANIM chunk after VP8X and before the first frame.
async function isAnimatedWebp(path: string): Promise<boolean> {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, 12, 0);
    if (
      bytesRead < 12 ||
      header.toString('latin1', 0, 4) !== 'RIFF' ||
      header.toString('latin1', 8, 12) !== 'WEBP'
    ) {
      return false;
    }
    const chunk = Buffer.alloc(8);
    let position = 12;
    for (let i = 0; i < MAX_WEBP_CHUNKS; i++) {
      const read = await handle.read(chunk, 0, 8, position);
      if (read.bytesRead < 8) return false;
      const fourCc = chunk.toString('latin1', 0, 4);
      if (fourCc === 'ANIM' || fourCc === 'ANMF') return true;
      if (fourCc === 'VP8 ' || fourCc === 'VP8L') return false;
      const size = chunk.readUInt32LE(4);
      position += 8 + size + (size % 2);
    }
    return false;
  } finally {
    await handle.close();
  }
}

function sendErrorCode(err: unknown): string | null {
  if (!(err instanceof WhatsappSendError)) return null;
  const code = err.graphCode ?? err.status;
  return code === undefined ? null : String(code);
}

@Injectable()
export class WhatsappMediaSendService {
  private readonly logger = new Logger(WhatsappMediaSendService.name);
  private client: S3Client | null = null;

  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly wa: WhatsappService,
    private readonly store: MessageStoreService,
    private readonly cloud: WhatsappCloudApiService,
    private readonly ai: WhatsappAiService,
    private readonly gateway: WhatsappGateway,
  ) {}

  // A Meta refusal after our copy is stored returns a failed row with a local id; our copy and its quota stay.
  async sendFile(
    companyId: string,
    userId: string,
    chatId: string,
    file: Express.Multer.File,
    options: WaMediaSendOptions = {},
  ): Promise<WaMessage> {
    try {
      return await this.sendFromDisk(companyId, userId, chatId, file, options);
    } finally {
      await unlink(file.path).catch((err: unknown) =>
        this.logger.error(
          `Failed to remove temp upload file ${file.path}: ${errorMessage(err)}`,
        ),
      );
    }
  }

  async retry(
    companyId: string,
    user: { userId: string; role: string },
    uuid: string,
  ): Promise<WaMessage> {
    const row = await this.store.findRowByUuid(companyId, uuid);
    if (!row) throw new NotFoundException('Message not found');
    if (
      row.userId !== user.userId &&
      (user.role as Role) !== Role.COMPANY_ADMIN
    ) {
      throw new ForbiddenException('You do not have access to this message');
    }
    // A null status on a local row is a claimed retry; the claim decides whether it was abandoned.
    if (
      !row.waMessageId.startsWith(WA_LOCAL_ID_PREFIX) ||
      (row.status !== WhatsappMessageStatus.FAILED && row.status !== null)
    ) {
      throw new ConflictException('Only a failed media message can be retried');
    }
    if (row.mediaStatus !== WaMediaStatus.STORED || !row.mediaKey) {
      throw new ConflictException(
        'The stored copy of this file is gone; it cannot be retried',
      );
    }

    const connection = await this.wa.findSendableConnection(
      row.userId,
      companyId,
      row.chatId,
    );
    const token = this.cloud.resolveAccessToken(connection);
    if (!token) throw new ServiceUnavailableException(RECONNECT_MESSAGE);
    if (!(await this.store.claimFailedLocalRow(companyId, uuid))) {
      throw new ConflictException('This message is already being retried');
    }

    const path = join(tmpdir(), `wa-retry-${randomUUID()}`);
    try {
      let sent: { messageId: string } | null = null;
      let failure: unknown = null;
      try {
        await this.downloadObject(row.mediaKey, path);
        await this.ai.recordHumanReply(row.userId, row.chatId);
        sent = await this.deliver(connection, token, row.chatId, {
          path,
          type: row.mediaType as WaOutboundMediaType,
          mime: row.mediaMime ?? 'application/octet-stream',
          uploadMime: metaUploadMime(
            row.mediaMime ?? 'application/octet-stream',
          ),
          fileName:
            row.mediaFileName ??
            generatedMediaFileName(row.mediaType, row.id, row.mediaMime),
          caption: row.body,
          // The voice flag is not stored; an outbound OGG audio row is a recorded note.
          voice: isVoiceNoteMedia(row.mediaType, row.mediaMime),
        });
      } catch (err) {
        failure = err;
        this.logger.warn(
          `Retry of message ${uuid} failed: ${errorMessage(err)}`,
        );
      }
      if (sent) {
        await this.store.promoteLocalRow(companyId, uuid, sent.messageId);
      } else {
        await this.store.markLocalRowFailed(
          companyId,
          uuid,
          sendErrorCode(failure),
        );
      }
    } finally {
      await unlink(path).catch(() => undefined);
    }

    const message = await this.store.getMessageByUuid(companyId, uuid);
    if (!message) throw new NotFoundException('Message not found');
    this.gateway.emitMessageUpdate(row.userId, message);
    return message;
  }

  private async sendFromDisk(
    companyId: string,
    userId: string,
    chatId: string,
    file: Express.Multer.File,
    options: WaMediaSendOptions,
  ): Promise<WaMessage> {
    const media = await this.inspect(file);
    const caption = options.caption ?? '';
    const voice = options.voice === true;
    if (caption && !CAPTIONED_TYPES.has(media.type)) {
      throw new BadRequestException(
        'A caption can only be sent with an image, a video or a document.',
      );
    }
    if (voice && !isVoiceNoteMedia(media.type, media.mime)) {
      throw new BadRequestException(
        'A voice note must be an OGG/Opus recording.',
      );
    }

    const connection = await this.wa.findSendableConnection(
      userId,
      companyId,
      chatId,
    );
    const token = this.cloud.resolveAccessToken(connection);
    if (!token) throw new ServiceUnavailableException(RECONNECT_MESSAGE);

    // Stickers never count toward quota, matching the delete and reconcile paths.
    const reservedBytes = countsTowardQuota(media.type) ? file.size : 0;
    if (reservedBytes) {
      await reserveStorage(this.companies, companyId, reservedBytes);
    }

    const uuid = randomUUID();
    const key = outboundObjectKey(companyId, userId, chatId, uuid, media.ext);
    try {
      await this.putObject(file.path, key, media.mime);
    } catch (err) {
      await this.releaseReservation(companyId, reservedBytes);
      this.logger.error(
        `Failed to store outbound media ${key}`,
        errorMessage(err, true),
      );
      throw new InternalServerErrorException(
        'The file could not be stored; it was not sent',
      );
    }

    const fileName =
      (media.type === 'document' && originalFileName(file.originalname)) ||
      generatedMediaFileName(media.type, uuid, media.mime);

    let sent: { messageId: string } | null = null;
    let failure: unknown = null;
    try {
      // Paused before Meta is called, as the text send does, so no queued AI turn lands mid-upload.
      await this.ai.recordHumanReply(userId, chatId);
      sent = await this.deliver(connection, token, chatId, {
        path: file.path,
        type: media.type,
        mime: media.mime,
        uploadMime: media.uploadMime,
        fileName,
        caption,
        voice,
      });
    } catch (err) {
      failure = err;
    }

    const now = new Date();
    const nowS = Math.floor(now.getTime() / 1000);
    const errorCode = sent ? null : sendErrorCode(failure);
    const msg: WaMessage = {
      uuid,
      id: sent ? sent.messageId : `${WA_LOCAL_ID_PREFIX}${uuid}`,
      chatId,
      senderId: connection.displayPhoneNumber,
      senderName: connection.displayPhoneNumber,
      chatName: chatId,
      isGroup: false,
      body: caption,
      hasMedia: true,
      mediaType: media.type,
      mediaMime: media.mime,
      mediaFileName: fileName,
      mediaSizeBytes: file.size,
      mediaStatus: WaMediaStatus.STORED,
      mediaStoredAt: now.toISOString(),
      mediaDeletedAt: null,
      mediaDeletedBy: null,
      mentionedIds: [],
      quotedParticipant: '',
      fromMe: true,
      aiGenerated: false,
      timestamp: nowS,
      originUserId: userId,
      ...(sent
        ? {}
        : { status: WhatsappMessageStatus.FAILED, statusAt: nowS, errorCode }),
    };

    try {
      await this.store.addMessage(
        companyId,
        userId,
        { ...msg, mediaKey: key },
        connection.phoneNumberId,
        sent
          ? {}
          : { status: WhatsappMessageStatus.FAILED, statusAt: now, errorCode },
      );
    } catch (err) {
      this.logger.error(
        `Failed to persist outbound media message ${msg.id} (object ${key})`,
        errorMessage(err, true),
      );
      // Meta already has a sent file, so a store outage must not read as a failed send and invite a duplicate.
      if (!sent) {
        await this.releaseReservation(companyId, reservedBytes);
        throw new BadGatewayException(
          'WhatsApp did not accept the file; it was not sent',
        );
      }
    }
    this.gateway.emitMessage(userId, msg);
    return msg;
  }

  // Detected from the bytes; the client's mime and extension are never trusted.
  private async inspect(file: Express.Multer.File): Promise<WaOutboundMedia> {
    const { fileTypeFromFile } = await import('file-type');
    const detected = await fileTypeFromFile(file.path);
    let mime: string | undefined = detected?.mime;
    if (!mime) {
      await verifyTextFile(file.path);
      mime = outboundTextMime(file.originalname);
    }
    const animated =
      baseMime(mime) === 'image/webp' && (await isAnimatedWebp(file.path));
    const resolved = resolveOutboundMedia(
      mime,
      file.size,
      file.originalname,
      animated,
    );
    if ('refusal' in resolved) {
      throw new BadRequestException(resolved.refusal);
    }
    return resolved;
  }

  private async deliver(
    connection: WhatsappConnection,
    token: string,
    chatId: string,
    file: DeliveryFile,
  ): Promise<{ messageId: string }> {
    const mediaId = await this.cloud.uploadMedia(connection, token, {
      path: file.path,
      mime: file.uploadMime,
      fileName: file.fileName,
    });
    return this.cloud.sendMedia(connection, chatId, {
      type: file.type,
      mediaId,
      caption: file.caption || undefined,
      fileName: file.fileName,
      voice: file.voice,
    });
  }

  private async putObject(
    path: string,
    key: string,
    mime: string,
  ): Promise<void> {
    const body = createReadStream(path);
    // An unlistened 'error' event on a Readable crashes the process.
    body.on('error', (err) =>
      this.logger.error(
        `Outbound media read error for ${path}: ${err.message}`,
      ),
    );
    try {
      await new Upload({
        client: this.getClient(),
        params: {
          Bucket: getWhatsappBucket(),
          Key: key,
          Body: body,
          ContentType: mime,
          CacheControl: `private, max-age=${resolveMediaUrlTtlSeconds()}`,
        },
        partSize: PART_SIZE_BYTES,
        queueSize: UPLOAD_QUEUE_SIZE,
      }).done();
    } finally {
      body.destroy();
    }
  }

  private async downloadObject(key: string, path: string): Promise<void> {
    const res = await this.getClient().send(
      new GetObjectCommand({ Bucket: getWhatsappBucket(), Key: key }),
    );
    if (!res.Body) throw new Error(`Empty body for object ${key}`);
    await pipeline(res.Body as Readable, createWriteStream(path));
  }

  private async releaseReservation(
    companyId: string,
    bytes: number,
  ): Promise<void> {
    await releaseStorage(this.companies, companyId, bytes).catch(
      (err: unknown) =>
        this.logger.error(
          `Failed to release storage reservation for company ${companyId}: ${errorMessage(err)}`,
        ),
    );
  }

  private getClient(): S3Client {
    this.client ??= buildWhatsappClient();
    return this.client;
  }
}
