import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import ContactSelection from 'land/utils/contact-selection';

module('Unit | Utility | contact-selection', function (hooks) {
  setupTest(hooks);

  test('starts empty and is not present', function (assert) {
    const selection = new ContactSelection();

    assert.strictEqual(selection.contact, null);
    assert.false(selection.isPresent);
    assert.deepEqual(selection.cleanIdentity, {});
  });

  test('an attached contact exposes its id and no inline details', function (assert) {
    const selection = new ContactSelection();
    selection.attach({ id: 'contact-1', displayName: 'Ahmed Al-Rashid' });

    assert.true(selection.isPresent);
    assert.strictEqual(selection.contactId, 'contact-1');
    assert.deepEqual(selection.cleanIdentity, {});
  });

  test('inline details send a trimmed owner identity', function (assert) {
    const selection = new ContactSelection();
    selection.setField('firstName', '  Ahmed ');
    selection.setField('phone', ' +971501234567 ');
    selection.setField('isWhatsapp', true);

    assert.true(selection.isPresent);
    assert.strictEqual(selection.contactId, null);
    assert.deepEqual(selection.cleanIdentity, {
      firstName: 'Ahmed',
      phone: '+971501234567',
      isWhatsapp: true,
    });
  });

  test('a last name alone counts as an owner', function (assert) {
    const selection = new ContactSelection();
    selection.setField('lastName', 'Al-Rashid Holdings');

    assert.true(selection.isPresent);
    assert.deepEqual(selection.cleanIdentity, {
      lastName: 'Al-Rashid Holdings',
    });
  });

  test('whitespace alone does not count as an owner', function (assert) {
    const selection = new ContactSelection();
    selection.setField('firstName', '   ');

    assert.false(selection.isPresent);
    assert.deepEqual(selection.cleanIdentity, {});
  });

  test('attaching a contact drops any typed details', function (assert) {
    const selection = new ContactSelection();
    selection.setField('firstName', 'Ahmed');
    selection.attach({ id: 'contact-1' });

    assert.strictEqual(selection.contactId, 'contact-1');
    assert.deepEqual(selection.cleanIdentity, {});
  });

  test('clear resets both sides', function (assert) {
    const selection = new ContactSelection();
    selection.attach({ id: 'contact-1' });
    selection.clear();

    assert.strictEqual(selection.contact, null);
    assert.false(selection.isPresent);
  });
});
