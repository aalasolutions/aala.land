import { module, test } from 'qunit';
import { tagLabel } from 'land/utils/tag-label';

module('Unit | Utility | tag-label', function () {
  test('reads labels from value-keyed options, case-insensitively', function (assert) {
    assert.strictEqual(
      tagLabel('wo', 'PENDING_APPROVAL'),
      'Pending Approval (Owner/Manager)',
    );
    assert.strictEqual(tagLabel('priority', 'urgent'), 'Urgent');
    assert.strictEqual(tagLabel('lead', 'WON'), 'Won & Closed');
  });

  test('reads labels from id-keyed options', function (assert) {
    assert.strictEqual(tagLabel('lease', 'DRAFT'), 'Draft');
    assert.strictEqual(tagLabel('lease', 'RENEWED'), 'Renewed');
    assert.strictEqual(
      tagLabel('lease', 'RESIDENTIAL'),
      'Residential (Long-Term)',
    );
  });

  test('contact tags use the contact tag labels', function (assert) {
    assert.strictEqual(
      tagLabel('contact', 'portfolio_owner'),
      'Portfolio Owner',
    );
    assert.strictEqual(tagLabel('contact', 'lead'), 'Lead');
  });

  test('unknown values and domains fall back to title case', function (assert) {
    assert.strictEqual(tagLabel('sub', 'past_due'), 'Past Due');
    assert.strictEqual(tagLabel('plan', 'ENTERPRISE'), 'Enterprise');
    assert.strictEqual(tagLabel('nope', 'IN_REVIEW'), 'In Review');
    assert.strictEqual(tagLabel('constructor', 'x'), 'X');
  });

  test('null, undefined and empty give an empty string', function (assert) {
    assert.strictEqual(tagLabel('lead', null), '');
    assert.strictEqual(tagLabel('lead', undefined), '');
    assert.strictEqual(tagLabel('lead', ''), '');
  });
});
