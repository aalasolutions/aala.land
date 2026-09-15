import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

const KEY_ENV = 'WHATSAPP_TOKEN_ENC_KEY';

const validKey = () => randomBytes(32).toString('base64');

describe('EncryptionService', () => {
  let service: EncryptionService;
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env[KEY_ENV];
    process.env[KEY_ENV] = validKey();
    service = new EncryptionService();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = originalKey;
    jest.restoreAllMocks();
  });

  const silenceErrors = () =>
    jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

  describe('encrypt', () => {
    it('emits the versioned four-part format', () => {
      const payload = service.encrypt('EAAG-secret-token');

      const parts = payload.split('.');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('v1');
      expect(Buffer.from(parts[1], 'base64')).toHaveLength(12);
      expect(Buffer.from(parts[2], 'base64')).toHaveLength(16);
      expect(payload).not.toContain('EAAG-secret-token');
    });

    it('uses a fresh IV per call, so the same plaintext never repeats', () => {
      const first = service.encrypt('same-token');
      const second = service.encrypt('same-token');

      expect(first).not.toEqual(second);
      expect(first.split('.')[1]).not.toEqual(second.split('.')[1]);
      expect(service.decrypt(first)).toBe('same-token');
      expect(service.decrypt(second)).toBe('same-token');
    });

    it('throws instead of storing plaintext when the key is missing', () => {
      delete process.env[KEY_ENV];

      expect(() => service.encrypt('EAAG-secret-token')).toThrow(KEY_ENV);
    });

    it('throws when the key is the wrong length', () => {
      process.env[KEY_ENV] = randomBytes(16).toString('base64');

      expect(() => service.encrypt('EAAG-secret-token')).toThrow(KEY_ENV);
    });
  });

  describe('decrypt', () => {
    it('round-trips a token unchanged', () => {
      expect(service.decrypt(service.encrypt('EAAG-secret-token'))).toBe(
        'EAAG-secret-token',
      );
    });

    it('round-trips unicode and long values', () => {
      const long = `${'x'.repeat(4096)}-مرحبا`;

      expect(service.decrypt(service.encrypt(long))).toBe(long);
    });

    it('returns null for a null or empty payload', () => {
      expect(service.decrypt(null)).toBeNull();
      expect(service.decrypt('')).toBeNull();
    });

    it('returns null and logs when the auth tag no longer matches the ciphertext', () => {
      const error = silenceErrors();
      const parts = service.encrypt('EAAG-secret-token').split('.');
      const body = Buffer.from(parts[3], 'base64');
      body[0] ^= 0xff;
      parts[3] = body.toString('base64');

      expect(service.decrypt(parts.join('.'))).toBeNull();
      expect(error).toHaveBeenCalled();
    });

    it('returns null and logs when the auth tag itself is edited', () => {
      const error = silenceErrors();
      const parts = service.encrypt('EAAG-secret-token').split('.');
      const tag = Buffer.from(parts[2], 'base64');
      tag[0] ^= 0xff;
      parts[2] = tag.toString('base64');

      expect(service.decrypt(parts.join('.'))).toBeNull();
      expect(error).toHaveBeenCalled();
    });

    it('returns null and logs for a payload that is not the v1 shape', () => {
      const error = silenceErrors();

      expect(service.decrypt('plaintext-token')).toBeNull();
      expect(service.decrypt('v2.a.b.c')).toBeNull();
      expect(service.decrypt('v1.only.three')).toBeNull();
      expect(error).toHaveBeenCalledTimes(3);
    });

    it('returns null and logs for a wrong-length IV', () => {
      const error = silenceErrors();
      const parts = service.encrypt('EAAG-secret-token').split('.');
      parts[1] = randomBytes(8).toString('base64');

      expect(service.decrypt(parts.join('.'))).toBeNull();
      expect(error).toHaveBeenCalled();
    });

    it('soft-fails instead of throwing when the key is missing', () => {
      const payload = service.encrypt('EAAG-secret-token');
      const error = silenceErrors();
      delete process.env[KEY_ENV];

      expect(service.decrypt(payload)).toBeNull();
      expect(error).toHaveBeenCalled();
    });

    it('soft-fails when a different key is used to read the payload', () => {
      const payload = service.encrypt('EAAG-secret-token');
      const error = silenceErrors();
      process.env[KEY_ENV] = validKey();

      expect(service.decrypt(payload)).toBeNull();
      expect(error).toHaveBeenCalled();
    });
  });
});
