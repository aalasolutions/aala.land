import { envInt } from '@shared/utils/env.util';
import { ALLOWED_DOCUMENT_TYPES } from '@shared/constants/document-types';
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

export type WaOutboundMediaType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker';

interface WaOutboundRule {
  type: WaOutboundMediaType;
  ext: string;
  limitBytes: number;
}

const KB = 1024;
const MB = 1024 * 1024;
export const WA_ANIMATED_STICKER_LIMIT_BYTES = 500 * KB;

const DOCUMENT_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/rtf': 'rtf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'image/gif': 'gif',
};

const MEDIA_RULES: Record<string, WaOutboundRule> = {
  'image/jpeg': { type: 'image', ext: 'jpg', limitBytes: 5 * MB },
  'image/png': { type: 'image', ext: 'png', limitBytes: 5 * MB },
  'video/mp4': { type: 'video', ext: 'mp4', limitBytes: 16 * MB },
  'video/3gpp': { type: 'video', ext: '3gp', limitBytes: 16 * MB },
  'audio/aac': { type: 'audio', ext: 'aac', limitBytes: 16 * MB },
  'audio/amr': { type: 'audio', ext: 'amr', limitBytes: 16 * MB },
  'audio/mpeg': { type: 'audio', ext: 'mp3', limitBytes: 16 * MB },
  'audio/mp4': { type: 'audio', ext: 'm4a', limitBytes: 16 * MB },
  'audio/ogg': { type: 'audio', ext: 'ogg', limitBytes: 16 * MB },
  // Static limit; an animated sticker is allowed WA_ANIMATED_STICKER_LIMIT_BYTES.
  'image/webp': { type: 'sticker', ext: 'webp', limitBytes: 100 * KB },
};

// Keyed by the mime detected from the file bytes, never the one the client sent.
export const WA_OUTBOUND_MEDIA: Readonly<Record<string, WaOutboundRule>> = {
  ...Object.fromEntries(
    ALLOWED_DOCUMENT_TYPES.filter((mime) => !(mime in MEDIA_RULES)).map(
      (mime) => [
        mime,
        {
          type: 'document',
          ext: DOCUMENT_EXT[mime] ?? 'bin',
          limitBytes: 100 * MB,
        },
      ],
    ),
  ),
  ...MEDIA_RULES,
};

// file-type names these differently from Meta, or cannot tell legacy Office formats apart.
const DETECTED_MIME_ALIASES: Record<string, string> = {
  'audio/x-m4a': 'audio/mp4',
};
const LEGACY_OFFICE_BY_EXT: Record<string, string> = {
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
};

// file-type reports Opus as 'audio/ogg; codecs=opus' and Vorbis, FLAC and Speex as plain 'audio/ogg'.
const OGG_OPUS_MIME = 'audio/ogg;codecs=opus';
export const WA_OGG_NOT_OPUS_MESSAGE =
  'Only OGG files encoded with Opus can be sent on WhatsApp.';

// Only Opus passes resolveOutboundMedia as audio/ogg, which is what a voice note needs.
export function isVoiceNoteMedia(
  type: string | null | undefined,
  mime: string | null | undefined,
): boolean {
  return type === 'audio' && baseMime(mime) === 'audio/ogg';
}

export const WA_VIDEO_TOO_LARGE_MESSAGE =
  'Video is over 16 MB. Send it as a document instead.';

const TOO_LARGE_MESSAGES: Record<WaOutboundMediaType, string> = {
  image: 'Image is over 5 MB.',
  video: WA_VIDEO_TOO_LARGE_MESSAGE,
  audio: 'Audio is over 16 MB.',
  document: 'File is over 100 MB.',
  sticker: 'Sticker is over 100 KB.',
};

export interface WaOutboundMedia {
  type: WaOutboundMediaType;
  mime: string;
  ext: string;
  limitBytes: number;
}

export interface WaOutboundRefusal {
  refusal: string;
}

function fileExt(fileName: string | null | undefined): string {
  return (
    /\.([A-Za-z0-9]{1,10})$/.exec(fileName ?? '')?.[1] ?? ''
  ).toLowerCase();
}

// A text document has no magic bytes, so its mime comes from the name once its content has been checked.
export function outboundTextMime(fileName: string | null | undefined): string {
  const ext = fileExt(fileName);
  if (ext === 'csv') return 'text/csv';
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  return 'text/plain';
}

export function resolveOutboundMedia(
  detectedMime: string | null | undefined,
  sizeBytes: number,
  fileName: string | null | undefined,
  animated = false,
): WaOutboundMedia | WaOutboundRefusal {
  let mime = baseMime(detectedMime);
  mime = DETECTED_MIME_ALIASES[mime] ?? mime;
  if (mime === 'application/x-cfb') {
    mime = LEGACY_OFFICE_BY_EXT[fileExt(fileName)] ?? mime;
  }
  const rule = WA_OUTBOUND_MEDIA[mime];
  if (!rule) {
    return {
      refusal: `This file type (${mime || 'unknown'}) cannot be sent on WhatsApp.`,
    };
  }
  if (
    mime === 'audio/ogg' &&
    (detectedMime ?? '').toLowerCase().replace(/\s+/g, '') !== OGG_OPUS_MIME
  ) {
    return { refusal: WA_OGG_NOT_OPUS_MESSAGE };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { refusal: 'The file is empty.' };
  }
  const limitBytes =
    rule.type === 'sticker' && animated
      ? WA_ANIMATED_STICKER_LIMIT_BYTES
      : rule.limitBytes;
  if (sizeBytes > limitBytes) {
    return {
      refusal:
        rule.type === 'sticker' && animated
          ? 'Animated sticker is over 500 KB.'
          : TOO_LARGE_MESSAGES[rule.type],
    };
  }
  return { type: rule.type, mime, ext: rule.ext, limitBytes };
}

// Outbound keys use the row uuid: the wamid is unknown until Meta accepts the send.
export function outboundObjectKey(
  companyId: string,
  userId: string,
  chatId: string,
  uuid: string,
  ext: string,
): string {
  return [
    'whatsapp',
    companyId,
    userId,
    safeWaMessageId(chatId),
    `${uuid}.${ext}`,
  ].join('/');
}
