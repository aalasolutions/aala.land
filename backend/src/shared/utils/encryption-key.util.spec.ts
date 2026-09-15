import { randomBytes } from 'crypto';
import { isValidEncryptionKey } from './encryption-key.util';

describe('isValidEncryptionKey', () => {
  it('returns true for a base64 string that decodes to 32 bytes', () => {
    expect(isValidEncryptionKey(randomBytes(32).toString('base64'))).toBe(
      true,
    );
  });

  it('returns false when undefined', () => {
    expect(isValidEncryptionKey(undefined)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidEncryptionKey('')).toBe(false);
  });

  it('returns false for a key of the wrong length', () => {
    expect(isValidEncryptionKey(randomBytes(16).toString('base64'))).toBe(
      false,
    );
  });
});
