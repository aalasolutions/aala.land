import { envInt } from '@shared/utils/env.util';
import {
  WA_MEDIA_DELETED_BY,
  WaMediaStatus,
  WaMessage,
  WaMessageInsert,
} from './wa-types';

export const WA_MEDIA_TYPES = new Set<string>([
  'image',
  'video',
  'audio',
  'document',
  'sticker',
]);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'text/plain': 'txt',
};

// Drops parameters such as "; codecs=opus".
export function baseMime(mime: string | null | undefined): string {
  return (mime ?? '').split(';')[0].trim().toLowerCase();
}

export function extFromMime(mime: string | null | undefined): string {
  return EXT_BY_MIME[baseMime(mime)] ?? 'bin';
}

// A document's own extension when it is plain alphanumeric, else the one implied by its mime.
export function mediaExt(
  fileName: string | null | undefined,
  mime: string | null | undefined,
): string {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(fileName ?? '');
  return match ? match[1].toLowerCase() : extFromMime(mime);
}

// wamids carry '.', '+', '/' and '='; none of them belong in a file name or object key.
export function safeWaMessageId(waMessageId: string): string {
  return waMessageId.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function generatedMediaFileName(
  mediaType: string,
  waMessageId: string,
  mime: string | null | undefined,
): string {
  return `${mediaType}-${safeWaMessageId(waMessageId)}.${extFromMime(mime)}`;
}

const DEFAULT_URL_TTL_SECONDS = 600;
const MIN_URL_TTL_SECONDS = 60;

// One lifetime for the signed URL and the object's Cache-Control, so the two never disagree.
export function resolveMediaUrlTtlSeconds(): number {
  return envInt(
    'WHATSAPP_MEDIA_URL_TTL_SECONDS',
    DEFAULT_URL_TTL_SECONDS,
    MIN_URL_TTL_SECONDS,
  );
}

export const WA_QUOTA_EXEMPT_MEDIA_TYPE = 'sticker';

export function countsTowardQuota(
  mediaType: string | null | undefined,
): boolean {
  return mediaType !== WA_QUOTA_EXEMPT_MEDIA_TYPE;
}

export function revokeMediaDeletedBy(fromMe: boolean): string {
  return fromMe
    ? WA_MEDIA_DELETED_BY.BUSINESS_APP_REVOKE
    : WA_MEDIA_DELETED_BY.CUSTOMER_REVOKE;
}

// Meta's error for an inbound file over its size limit; the file never arrives.
const MEDIA_TOO_LARGE_CODE = '131052';

export interface CloudMedia {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  // document only.
  filename?: string;
  // sticker only.
  animated?: boolean;
  // audio only; true for a recorded voice note.
  voice?: boolean;
}

export interface CloudMediaMessage {
  id?: string;
  type?: string;
  image?: CloudMedia;
  video?: CloudMedia;
  audio?: CloudMedia;
  document?: CloudMedia;
  sticker?: CloudMedia;
  errors?: { code?: number | string }[];
}

// Media columns of a row; body holds only the caption the customer typed.
export interface InboundMedia {
  body: string;
  mediaType: string;
  mediaStatus: WaMediaStatus;
  mediaMetaId: string | null;
  mediaMime: string | null;
  mediaSha256: string | null;
  mediaFileName: string | null;
}

// Null means the message is not stored as media: not a media type, or no media id.
export function resolveInboundMedia(
  message: CloudMediaMessage,
): InboundMedia | null {
  const type = message.type ?? '';
  const isMediaType = WA_MEDIA_TYPES.has(type);
  if (
    (message.errors ?? []).some(
      (error) => String(error.code) === MEDIA_TOO_LARGE_CODE,
    )
  ) {
    return {
      body: '',
      mediaType: isMediaType ? type : 'media_placeholder',
      mediaStatus: WaMediaStatus.TOO_LARGE,
      mediaMetaId: null,
      mediaMime: null,
      mediaSha256: null,
      mediaFileName: null,
    };
  }
  if (!isMediaType || !message.id) return null;
  const media = message[type as 'image'];
  if (!media?.id) return null;
  const mime = media.mime_type ?? null;
  return {
    body: media.caption ?? '',
    mediaType: type,
    mediaStatus: WaMediaStatus.PENDING,
    mediaMetaId: media.id,
    mediaMime: mime,
    mediaSha256: media.sha256 ?? null,
    mediaFileName:
      media.filename?.trim() || generatedMediaFileName(type, message.id, mime),
  };
}

// The socket payload carries no Meta media id or hash.
export function toWireMessage(evt: WaMessage & WaMessageInsert): WaMessage {
  const message: WaMessage & WaMessageInsert = { ...evt };
  delete message.mediaMetaId;
  delete message.mediaSha256;
  return message;
}
