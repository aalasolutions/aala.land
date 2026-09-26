import { module, test } from 'qunit';
import { contactName } from 'land/utils/contact-name';

module('Unit | Utility | contact-name', function () {
  test('displayName wins when present', function (assert) {
    assert.strictEqual(
      contactName({ displayName: 'Test User', firstName: 'Other' }),
      'Test User',
    );
  });

  test('a limited contact gives first name and last initial', function (assert) {
    assert.strictEqual(
      contactName({ firstName: 'Test', lastName: 'User' }),
      'Test U.',
    );
    assert.strictEqual(
      contactName({ firstName: 'Test', lastName: 'U' }),
      'Test U.',
    );
    assert.strictEqual(contactName({ firstName: 'Test' }), 'Test');
    assert.strictEqual(contactName({ lastName: 'User' }), 'U.');
  });

  test('nothing to show falls back', function (assert) {
    assert.strictEqual(contactName(null, 'Unknown tenant'), 'Unknown tenant');
    assert.strictEqual(contactName({}, 'Unknown tenant'), 'Unknown tenant');
    assert.strictEqual(contactName({ firstName: '  ' }), '');
  });
});
