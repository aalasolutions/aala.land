const KEY_BYTES = 32;

/** True iff `raw` base64-decodes to exactly KEY_BYTES bytes, the shape EncryptionService requires. */
export function isValidEncryptionKey(raw: string | undefined): boolean {
  if (!raw) return false;
  return Buffer.from(raw, 'base64').length === KEY_BYTES;
}
