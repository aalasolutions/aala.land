const MAX_FILE_NAME_LENGTH = 200;

// Browsers send UTF-8 names that busboy decodes as latin1; bytes that are not valid UTF-8 stay as they are.
export function originalFileName(name: string): string {
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

// Storage keys and temp files keep only ASCII letters, digits, dot, underscore and dash.
export function storageSafeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, MAX_FILE_NAME_LENGTH);
}
