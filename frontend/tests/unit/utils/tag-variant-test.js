import { module, test } from 'qunit';
import { tagVariant } from 'land/utils/tag-variant';

module('Unit | Utility | tag-variant', function () {
  test('maps a domain value to its kit role, case-insensitively', function (assert) {
    assert.strictEqual(tagVariant('lead', 'WON'), 'success');
    assert.strictEqual(tagVariant('sub', 'past_due'), 'warning');
    assert.strictEqual(tagVariant('chequestate', 'bounced'), 'danger');
  });

  test('neutral values render the kit gray through secondary', function (assert) {
    assert.strictEqual(tagVariant('temp', 'DEAD'), 'secondary');
    assert.strictEqual(tagVariant('contact', 'other'), 'secondary');
  });

  test('both subscription spellings of canceled map the same', function (assert) {
    assert.strictEqual(tagVariant('sub', 'canceled'), 'secondary');
    assert.strictEqual(tagVariant('sub', 'cancelled'), 'secondary');
  });

  test('unknown domains, values and empty input give no variant', function (assert) {
    assert.strictEqual(tagVariant('lead', 'archived'), undefined);
    assert.strictEqual(tagVariant('nope', 'won'), undefined);
    assert.strictEqual(tagVariant('lead', null), undefined);
    assert.strictEqual(tagVariant('lead', 'constructor'), undefined);
  });
});
