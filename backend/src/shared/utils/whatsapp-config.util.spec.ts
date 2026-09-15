import { randomBytes } from 'crypto';
import { isWhatsappConfigured } from './whatsapp-config.util';

const REQUIRED_VARS = [
  'WHATSAPP_APP_ID',
  'WHATSAPP_ES_CONFIG_ID',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_TOKEN_ENC_KEY',
] as const;

const validKey = () => randomBytes(32).toString('base64');

const setAllValid = () => {
  process.env.WHATSAPP_APP_ID = 'app-id';
  process.env.WHATSAPP_ES_CONFIG_ID = 'config-id';
  process.env.WHATSAPP_APP_SECRET = 'app-secret';
  process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token';
  process.env.WHATSAPP_TOKEN_ENC_KEY = validKey();
};

describe('isWhatsappConfigured', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of REQUIRED_VARS) original[name] = process.env[name];
  });

  afterEach(() => {
    for (const name of REQUIRED_VARS) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  });

  it('returns true when all 5 vars are set and the key is valid', () => {
    setAllValid();
    expect(isWhatsappConfigured()).toBe(true);
  });

  it.each(REQUIRED_VARS)('returns false when %s is missing', (name) => {
    setAllValid();
    delete process.env[name];
    expect(isWhatsappConfigured()).toBe(false);
  });

  it.each(REQUIRED_VARS)('returns false when %s is blank', (name) => {
    setAllValid();
    process.env[name] = '   ';
    expect(isWhatsappConfigured()).toBe(false);
  });

  it('returns false when the encryption key is the wrong length', () => {
    setAllValid();
    process.env.WHATSAPP_TOKEN_ENC_KEY = randomBytes(16).toString('base64');
    expect(isWhatsappConfigured()).toBe(false);
  });
});
