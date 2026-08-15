import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import OwnerSelection from 'land/utils/owner-selection';

module('Unit | Utility | owner-selection', function (hooks) {
  setupTest(hooks);

  test('starts empty and is not present', function (assert) {
    const selection = new OwnerSelection();

    assert.strictEqual(selection.contact, null);
    assert.false(selection.isPresent);
    assert.deepEqual(selection.payload, {});
  });

  test('an attached contact sends ownerId only', function (assert) {
    const selection = new OwnerSelection();
    selection.attach({ id: 'contact-1', displayName: 'Ahmed Al-Rashid' });

    assert.true(selection.isPresent);
    assert.deepEqual(selection.payload, { ownerId: 'contact-1' });
  });

  test('inline details send a trimmed owner identity', function (assert) {
    const selection = new OwnerSelection();
    selection.setField('firstName', '  Ahmed ');
    selection.setField('phone', ' +971501234567 ');
    selection.setField('isWhatsapp', true);

    assert.true(selection.isPresent);
    assert.deepEqual(selection.payload, {
      owner: {
        firstName: 'Ahmed',
        phone: '+971501234567',
        isWhatsapp: true,
      },
    });
  });

  test('a last name alone counts as an owner', function (assert) {
    const selection = new OwnerSelection();
    selection.setField('lastName', 'Al-Rashid Holdings');

    assert.true(selection.isPresent);
    assert.deepEqual(selection.payload, {
      owner: { lastName: 'Al-Rashid Holdings' },
    });
  });

  test('whitespace alone does not count as an owner', function (assert) {
    const selection = new OwnerSelection();
    selection.setField('firstName', '   ');

    assert.false(selection.isPresent);
    assert.deepEqual(selection.payload, {});
  });

  test('attaching a contact drops any typed details', function (assert) {
    const selection = new OwnerSelection();
    selection.setField('firstName', 'Ahmed');
    selection.attach({ id: 'contact-1' });

    assert.deepEqual(selection.payload, { ownerId: 'contact-1' });
  });

  test('clear resets both sides', function (assert) {
    const selection = new OwnerSelection();
    selection.attach({ id: 'contact-1' });
    selection.clear();

    assert.strictEqual(selection.contact, null);
    assert.false(selection.isPresent);
  });
});
