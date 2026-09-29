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

  test('a typed number is sent only beside a limited contact', function (assert) {
    const selection = new ContactSelection();
    selection.attach({ id: 'contact-1', accessLevel: 'LIMITED' });
    selection.setVerifyPhone(' +971501234567 ');

    assert.strictEqual(selection.cleanVerifyPhone, '+971501234567');
    assert.deepEqual(selection.verifyPhoneField('contactVerifyPhone'), {
      contactVerifyPhone: '+971501234567',
    });

    selection.attach({ id: 'contact-2', accessLevel: 'FULL' });
    selection.setVerifyPhone('+971501234567');
    assert.deepEqual(
      selection.verifyPhoneField('ownerVerifyPhone'),
      {},
      'a full contact needs no unlock',
    );
  });

  test('picking another contact or clearing drops the typed number', function (assert) {
    const selection = new ContactSelection();
    selection.attach({ id: 'contact-1', accessLevel: 'LIMITED' });
    selection.setVerifyPhone('0501234567');
    selection.attach({ id: 'contact-3', accessLevel: 'LIMITED' });
    assert.strictEqual(selection.verifyPhone, '');

    selection.setVerifyPhone('0501234567');
    selection.clear();
    assert.strictEqual(selection.verifyPhone, '');
  });

  test('a CONTACT_EXISTS conflict keeps the presented match until a contact is picked', function (assert) {
    const selection = new ContactSelection();
    const match = {
      id: 'contact-9',
      accessLevel: 'LIMITED',
      firstName: 'Omar',
    };
    const conflict = new Error('Contact already added');
    conflict.status = 409;
    conflict.body = { code: 'CONTACT_EXISTS', contact: match };

    assert.true(selection.takeConflict(conflict));
    assert.strictEqual(selection.conflict, match);

    selection.attach(match);
    assert.strictEqual(selection.conflict, null);
    assert.strictEqual(selection.contactId, 'contact-9');
  });

  test('any other error is not a conflict and clears an old one', function (assert) {
    const selection = new ContactSelection();
    selection.conflict = { id: 'stale' };
    const other = new Error('Bad Request');
    other.status = 400;
    other.body = { message: 'Bad Request' };

    assert.false(selection.takeConflict(other));
    assert.strictEqual(selection.conflict, null);
    assert.false(selection.takeConflict(undefined));
  });
});
