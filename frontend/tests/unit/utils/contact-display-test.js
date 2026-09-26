import { module, test } from 'qunit';
import {
  canEditContact,
  canWhatsapp,
  contactEmail,
  contactName,
  contactPhone,
  isLimited,
} from 'land/utils/contact-display';

const FULL = {
  id: 'c-1',
  accessLevel: 'FULL',
  displayName: 'Sara Khan',
  firstName: 'Sara',
  lastName: 'Khan',
  phone: '+971501112233',
  email: 'sara@example.com',
  isWhatsapp: true,
};

const LIMITED = {
  id: 'c-2',
  accessLevel: 'LIMITED',
  firstName: 'Omar',
  lastInitial: 'H.',
  phoneMasked: '+971 50 *** **67',
};

module('Unit | Utility | contact-display', function () {
  test('isLimited reads the presented access level only', function (assert) {
    assert.true(isLimited(LIMITED));
    assert.false(isLimited(FULL));
    assert.false(
      isLimited({ id: 'raw' }),
      'an unpresented contact is not limited',
    );
    assert.false(isLimited(null));
  });

  test('contactName uses the full name or the first name and initial', function (assert) {
    assert.strictEqual(contactName(FULL), 'Sara Khan');
    assert.strictEqual(contactName(LIMITED), 'Omar H.');
    assert.strictEqual(
      contactName({ firstName: 'Zainab', lastName: 'Qureshi' }),
      'Zainab Qureshi',
      'relation-loaded contacts lack displayName',
    );
  });

  test('a nameless contact falls back to its phone, masked when limited', function (assert) {
    assert.strictEqual(
      contactName({ phone: '+971500000001' }),
      '+971500000001',
    );
    assert.strictEqual(
      contactName({ accessLevel: 'LIMITED', phoneMasked: '+971 50 *** **01' }),
      '+971 50 *** **01',
    );
    assert.strictEqual(contactName(null), '');
  });

  test('contactPhone never hands out the real number of a limited contact', function (assert) {
    assert.strictEqual(contactPhone(FULL), '+971501112233');
    assert.strictEqual(contactPhone(LIMITED), '+971 50 *** **67');
    assert.strictEqual(
      contactPhone({ ...LIMITED, phone: '+971501234567' }),
      '+971 50 *** **67',
      'even if a raw phone slipped through',
    );
    assert.strictEqual(contactPhone(undefined), '');
  });

  test('contactEmail is empty for a limited contact', function (assert) {
    assert.strictEqual(contactEmail(FULL), 'sara@example.com');
    assert.strictEqual(
      contactEmail({ ...LIMITED, email: 'x@example.com' }),
      '',
    );
    assert.strictEqual(contactEmail(null), '');
  });

  test('canWhatsapp needs a full contact with a WhatsApp number', function (assert) {
    assert.true(canWhatsapp(FULL));
    assert.false(canWhatsapp({ ...FULL, isWhatsapp: false }));
    assert.false(canWhatsapp({ ...FULL, phone: null }));
    assert.false(canWhatsapp({ ...LIMITED, isWhatsapp: true }));
    assert.false(canWhatsapp(null));
  });
  test('canEditContact follows the backend edit rule per role', function (assert) {
    const contact = { id: 'c-1', regionCode: 'DXB', createdBy: 'user-1' };
    const user = (role, regionCodes = [], id = 'user-9') => ({
      id,
      role,
      regionCodes,
    });

    assert.true(canEditContact(contact, user('super_admin')));
    assert.true(canEditContact(contact, user('company_admin')));
    assert.true(canEditContact(contact, user('admin', ['DXB'])));
    assert.true(canEditContact(contact, user('manager', ['AUH', 'DXB'])));
    assert.false(canEditContact(contact, user('manager', ['AUH'])));
    assert.false(canEditContact(contact, user('admin')), 'no regions, no edit');
    assert.true(canEditContact(contact, user('agent', [], 'user-1')));
    assert.false(
      canEditContact(contact, user('agent', ['DXB'])),
      'a granted or linked agent views but does not edit',
    );
    assert.false(canEditContact(contact, user('accountant', ['DXB'])));
    assert.false(
      canEditContact({ id: 'c-2', createdBy: null }, user('agent', [], null)),
    );
    assert.false(canEditContact(null, user('company_admin')));
    assert.false(canEditContact(contact, null));
  });
});
