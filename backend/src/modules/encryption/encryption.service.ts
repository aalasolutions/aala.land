import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { errorMessage } from '@shared/utils/error.util';
import { isValidEncryptionKey } from '@shared/utils/encryption-key.util';
import { envString } from '@shared/utils/env.util';

// Format v1.<iv b64>.<tag b64>.<ciphertext b64>; base64 has no dot, so the split is unambiguous.
const VERSION = 'v1';

const ALGORITHM = 'aes-256-gcm';

const KEY_ENV = 'WHATSAPP_TOKEN_ENC_KEY';

const KEY_BYTES = 32;

// GCM's native nonce size. Anything else costs a rehash of the counter block for no gain.
const IV_BYTES = 12;

const AUTH_TAG_BYTES = 16;

const PART_COUNT = 4;

// App-level AES-256-GCM for secrets-as-text; first consumer: access_token_ciphertext column.
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);

  // Fails CLOSED. A missing or malformed key throws; storing plaintext is never a fallback.
  encrypt(plaintext: string): string {
    const key = this.readKey();
    if (!key) {
      throw new Error(
        `${KEY_ENV} is missing or does not decode to ${KEY_BYTES} bytes; refusing to store an unencrypted secret`,
      );
    }

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return [
      VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }

  // Fails SOFT: null on a dead key or tampered row so one bad connection can't halt the worker loop.
  decrypt(payload: string | null | undefined): string | null {
    if (!payload) return null;

    const key = this.readKey();
    if (!key) {
      this.logger.error(
        `${KEY_ENV} is missing or does not decode to ${KEY_BYTES} bytes; every stored secret is unreadable`,
      );
      return null;
    }

    const parts = payload.split('.');
    if (parts.length !== PART_COUNT || parts[0] !== VERSION) {
      this.logger.error(
        `Stored secret is not a ${VERSION} ${PART_COUNT}-part payload; discarded unread`,
      );
      return null;
    }

    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      this.logger.error(
        'Stored secret carries a wrong-length IV or auth tag; discarded unread',
      );
      return null;
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(Buffer.from(parts[3], 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (err) {
      // Wrong key or edited ciphertext both land here: GCM rejects the tag.
      this.logger.error(
        `Stored secret failed authentication and was discarded: ${errorMessage(err)}`,
      );
      return null;
    }
  }

  // Single key, no key id in v1: rotating the key invalidates every stored secret.
  private readKey(): Buffer | null {
    const raw = envString(KEY_ENV);
    if (!isValidEncryptionKey(raw)) return null;
    return Buffer.from(raw as string, 'base64');
  }
}
