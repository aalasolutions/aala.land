export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const DOCUMENT_TYPE_NOT_ALLOWED =
  'This file type is not allowed. Upload a PDF, Office document, text file or image.';

// Legacy Office files share one container format, which file-type reports only as x-cfb.
const LEGACY_OFFICE_BY_EXT: Record<string, string> = {
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
};

export function resolveLegacyOfficeMime(
  detectedMime: string,
  fileName: string | null | undefined,
): string {
  if (detectedMime !== 'application/x-cfb') return detectedMime;
  const ext = /\.([A-Za-z0-9]{1,10})$/.exec(fileName ?? '')?.[1] ?? '';
  return LEGACY_OFFICE_BY_EXT[ext.toLowerCase()] ?? detectedMime;
}
