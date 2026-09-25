const KB = 1024;
const MB = 1024 * 1024;

// Mirrors the server's per-type limits so a refusal shows before any upload.
const LIMITS = [
  {
    kind: 'image',
    label: 'Image',
    max: 5 * MB,
    types: ['image/jpeg', 'image/png'],
  },
  {
    kind: 'video',
    label: 'Video',
    max: 16 * MB,
    types: ['video/mp4', 'video/3gpp'],
  },
  {
    kind: 'audio',
    label: 'Audio',
    max: 16 * MB,
    types: ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg'],
  },
  // An animated sticker may reach 500 KB; a static one over 100 KB is left to the server.
  { kind: 'sticker', label: 'Sticker', max: 500 * KB, types: ['image/webp'] },
  {
    kind: 'document',
    label: 'File',
    max: 100 * MB,
    types: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/markdown',
      'text/csv',
    ],
  },
];

export const UNSUPPORTED_TYPE_ERROR =
  'This file type cannot be sent on WhatsApp.';
export const VIDEO_TOO_LARGE_ERROR = 'Video is over 16 MB.';
export const CAPTION_MAX_LENGTH = 1024;

export const OUTBOUND_ACCEPT = LIMITS.flatMap((entry) => entry.types).join(',');

const LIMIT_BY_TYPE = new Map(
  LIMITS.flatMap((entry) => entry.types.map((type) => [type, entry])),
);

const DOCUMENT_LIMIT = LIMITS.find((entry) => entry.kind === 'document');

// Browsers report no type for these text extensions; the server detects the text itself.
const UNTYPED_TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'log',
  'json',
]);

const CAPTION_KINDS = new Set(['image', 'video', 'document']);

// Meta carries a caption only on image, video and document messages.
export function canCaption(kindOrItem) {
  const kind = typeof kindOrItem === 'string' ? kindOrItem : kindOrItem?.kind;
  return CAPTION_KINDS.has(kind);
}

function limitFor(file, type) {
  if (type) return LIMIT_BY_TYPE.get(type);
  const extension = (file?.name ?? '').split('.').pop().toLowerCase();
  const hasExtension = (file?.name ?? '').includes('.');
  return hasExtension && UNTYPED_TEXT_EXTENSIONS.has(extension)
    ? DOCUMENT_LIMIT
    : undefined;
}

export function formatLimit(bytes) {
  return bytes >= MB ? `${bytes / MB} MB` : `${bytes / KB} KB`;
}

// `kind` is null only for a type WhatsApp does not accept.
export function classifyOutboundFile(file) {
  const type = (file?.type ?? '').split(';')[0].trim().toLowerCase();
  const limit = limitFor(file, type);
  if (!limit) return { kind: null, error: UNSUPPORTED_TYPE_ERROR };
  if (file.size <= limit.max) return { kind: limit.kind, error: null };
  const error =
    limit.kind === 'video'
      ? VIDEO_TOO_LARGE_ERROR
      : `${limit.label} is over ${formatLimit(limit.max)}.`;
  return { kind: limit.kind, error };
}

// A local id means Meta never accepted the send; failed or unsettled, the server can resend it.
export function isRetryableSend(msg) {
  return (
    (msg?.status === 'failed' || msg?.status == null) &&
    Boolean(msg?.hasMedia) &&
    typeof msg?.id === 'string' &&
    msg.id.startsWith('local-')
  );
}
