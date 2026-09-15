import { module, test } from 'qunit';
import {
  DISCONNECT_FALLBACK_TEXT,
  DISCONNECT_REASON_TEXT,
  TOKEN_INVALID_TEXT,
  disconnectReasonText,
  isTokenInvalidReason,
} from 'land/utils/whatsapp-disconnect-reasons';

module('Unit | Utility | whatsapp-disconnect-reasons', function () {
  test('every known code has its own plain text', function (assert) {
    const expected = {
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

    assert.deepEqual(
      Object.keys(DISCONNECT_REASON_TEXT).sort(),
      Object.keys(expected).sort(),
    );
    for (const [code, text] of Object.entries(expected)) {
      assert.strictEqual(disconnectReasonText(code), text, code);
    }
  });

  test('any token_invalid code reads as expired authorization', function (assert) {
    for (const code of ['token_invalid_190', 'token_invalid_http_401']) {
      assert.true(isTokenInvalidReason(code), code);
      assert.strictEqual(disconnectReasonText(code), TOKEN_INVALID_TEXT, code);
    }
  });

  test('an unknown code falls back and never shows the raw code', function (assert) {
    const text = disconnectReasonText('SOME_NEW_META_REASON');

    assert.strictEqual(text, DISCONNECT_FALLBACK_TEXT);
    assert.false(text.includes('SOME_NEW_META_REASON'));
    assert.strictEqual(
      disconnectReasonText('toString'),
      DISCONNECT_FALLBACK_TEXT,
    );
    assert.false(isTokenInvalidReason('PARTNER_REMOVED'));
  });

  test('null and undefined fall back', function (assert) {
    assert.strictEqual(disconnectReasonText(null), DISCONNECT_FALLBACK_TEXT);
    assert.strictEqual(
      disconnectReasonText(undefined),
      DISCONNECT_FALLBACK_TEXT,
    );
    assert.false(isTokenInvalidReason(null));
  });
});
