import { module, test } from 'qunit';
import { sameOriginPath } from 'land/utils/same-origin-path';

const ORIGIN = 'https://app.example.com';

module('Unit | Utility | same-origin-path', function () {
  test('keeps the path, query and hash of a same-origin URL', function (assert) {
    assert.strictEqual(
      sameOriginPath(`${ORIGIN}/billing/success?a=1#top`, ORIGIN),
      '/billing/success?a=1#top',
    );
  });

  test('resolves a relative path against the origin', function (assert) {
    assert.strictEqual(
      sameOriginPath('/billing/cancel', ORIGIN),
      '/billing/cancel',
    );
  });

  test('rejects another origin, scheme or port', function (assert) {
    assert.strictEqual(sameOriginPath('https://evil.example/x', ORIGIN), null);
    assert.strictEqual(sameOriginPath('//evil.example/x', ORIGIN), null);
    assert.strictEqual(
      sameOriginPath('http://app.example.com/x', ORIGIN),
      null,
    );
    assert.strictEqual(
      sameOriginPath('https://app.example.com:8443/x', ORIGIN),
      null,
    );
    assert.strictEqual(sameOriginPath('javascript:alert(1)', ORIGIN), null);
  });

  test('returns null for an empty value', function (assert) {
    assert.strictEqual(sameOriginPath(null, ORIGIN), null);
    assert.strictEqual(sameOriginPath('', ORIGIN), null);
  });
});
