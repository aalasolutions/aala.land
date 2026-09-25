import { module, test } from 'qunit';
import { initialsOf } from 'land/utils/initials';

module('Unit | Utility | initials', function () {
  test('a blank name falls back to a question mark', function (assert) {
    assert.strictEqual(initialsOf(''), '?');
    assert.strictEqual(initialsOf('   '), '?');
    assert.strictEqual(initialsOf(null), '?');
    assert.strictEqual(initialsOf(undefined), '?');
  });

  test('one word gives one letter', function (assert) {
    assert.strictEqual(initialsOf('layla'), 'L');
  });

  test('two words give two letters', function (assert) {
    assert.strictEqual(initialsOf('Test User'), 'TU');
  });

  test('three words still give only the first two letters', function (assert) {
    assert.strictEqual(initialsOf('One Two Three'), 'OT');
  });

  test('an emoji-led name keeps the whole emoji', function (assert) {
    assert.strictEqual(initialsOf('😀 Team'), '😀T');
    assert.strictEqual(initialsOf('🏠'), '🏠');
  });

  test('a digits-only name gives its first digit', function (assert) {
    assert.strictEqual(initialsOf('971501234567'), '9');
  });
});
