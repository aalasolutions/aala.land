const TOKEN_INVALID_PREFIX = 'token_invalid';

export const TOKEN_INVALID_TEXT =
  'Meta authorization expired. Reconnect to send again.';

export const DISCONNECT_FALLBACK_TEXT = 'This number was disconnected.';

export const DISCONNECT_REASON_TEXT = {
  SELF_DISCONNECTED: 'You disconnected this number.',
  SEAT_REMOVED: 'This number was disconnected when your seat was removed.',
  PARTNER_REMOVED: 'Access was removed in Meta Business settings.',
  ACCOUNT_OFFBOARDED:
    'WhatsApp moved to another device. It usually reconnects on its own.',
  ACCOUNT_DISCONNECTED: 'Meta disconnected this WhatsApp account.',
  BUSINESS_DOWNGRADE: 'This number was moved to the regular WhatsApp app.',
  CHANGE_NUMBER: 'The WhatsApp number was changed.',
  COMPANION_INACTIVITY:
    'Disconnected after about 30 days without use on a linked device.',
  PRIMARY_INACTIVITY:
    'Disconnected after about 14 days without opening WhatsApp on the phone.',
  USER_RE_REGISTERED: 'This number was registered on WhatsApp again.',
};

export function isTokenInvalidReason(code) {
  return typeof code === 'string' && code.startsWith(TOKEN_INVALID_PREFIX);
}

export function disconnectReasonText(code) {
  if (isTokenInvalidReason(code)) return TOKEN_INVALID_TEXT;
  return (
    (Object.hasOwn(DISCONNECT_REASON_TEXT, code ?? '') &&
      DISCONNECT_REASON_TEXT[code]) ||
    DISCONNECT_FALLBACK_TEXT
  );
}
