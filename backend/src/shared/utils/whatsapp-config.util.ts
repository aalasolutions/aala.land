import { isValidEncryptionKey } from './encryption-key.util';
import { envString } from './env.util';

const REQUIRED_VARS = [
  'WHATSAPP_APP_ID',
  'WHATSAPP_ES_CONFIG_ID',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
] as const;

const KEY_ENV = 'WHATSAPP_TOKEN_ENC_KEY';

/** True iff WhatsApp env is fully configured; never reveals which variable is missing. */
export function isWhatsappConfigured(): boolean {
  const allSet = REQUIRED_VARS.every((name) => !!envString(name));
  return allSet && isValidEncryptionKey(envString(KEY_ENV));
}
