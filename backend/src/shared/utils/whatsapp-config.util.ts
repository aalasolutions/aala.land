import { isValidEncryptionKey } from './encryption-key.util';

const REQUIRED_VARS = [
  'WHATSAPP_APP_ID',
  'WHATSAPP_ES_CONFIG_ID',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
] as const;

const KEY_ENV = 'WHATSAPP_TOKEN_ENC_KEY';

/**
 * Server-level flag: true iff every WhatsApp env var is set and non-empty after trim,
 * and WHATSAPP_TOKEN_ENC_KEY is a valid encryption key. Same for every caller; never
 * reveals which variable is missing.
 */
export function isWhatsappConfigured(): boolean {
  const allSet = REQUIRED_VARS.every((name) => !!process.env[name]?.trim());
  return allSet && isValidEncryptionKey(process.env[KEY_ENV]?.trim());
}
