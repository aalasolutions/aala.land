import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, render, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const CONTACT = {
  id: 'c-1',
  firstName: 'Test',
  lastName: 'User',
  email: 'user@example.com',
  phone: '+971500000000',
  isWhatsapp: true,
  nationality: 'Emirati',
  nationalId: 'ID-1',
  contactCompany: 'Example Co',
  jobTitle: 'Manager',
  address: 'Example Street',
  notes: 'Old notes',
};

module('Integration | Component | contact/contact-drawer', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.failWith = null;
    this.calls = stubAuth(this.owner, {
      respond: () =>
        this.failWith ? new Error(this.failWith) : { data: { id: 'c-new' } },
    });
    this.toasts = stubNotifications(this.owner);
    this.open = true;
    this.contact = null;
    this.saved = 0;
    this.closed = 0;
    this.onSaved = () => this.saved++;
    this.onClose = () => this.closed++;
  });

  async function renderDrawer() {
    await render(
      hbs`<Contact::ContactDrawer @open={{this.open}} @contact={{this.contact}} @onClose={{this.onClose}} @onSaved={{this.onSaved}} />`,
    );
    await waitFor('#contact-form');
  }

  function sent(calls, method) {
    return calls.find((c) => c.method === method);
  }

  test('create posts only the filled fields and always sends isWhatsapp', async function (assert) {
    await renderDrawer();
    assert.dom('[data-test-save-contact]').hasText('Create Contact');

    await fillIn('[data-test-input-first-name]', 'New');
    await fillIn('[data-test-input-phone]', '+971511111111');
    await click('[data-test-save-contact]');

    const post = sent(this.calls, 'POST');
    assert.strictEqual(post.path, '/contacts');
    assert.deepEqual(post.body, {
      isWhatsapp: false,
      firstName: 'New',
      phone: '+971511111111',
    });
    assert.strictEqual(this.saved, 1);
    assert.strictEqual(this.closed, 1);
    assert.deepEqual(this.toasts, [
      { type: 'success', message: 'Contact created' },
    ]);
  });

  test('create sends isWhatsapp true when ticked', async function (assert) {
    await renderDrawer();
    await fillIn('[data-test-input-first-name]', 'New');
    await fillIn('[data-test-input-phone]', '+971511111111');
    await click('[data-test-input-is-whatsapp] [data-test-nu-checkbox-input]');
    await click('[data-test-save-contact]');

    assert.deepEqual(sent(this.calls, 'POST').body, {
      isWhatsapp: true,
      firstName: 'New',
      phone: '+971511111111',
    });
  });

  test('edit prefills and patches every field, a cleared field as null', async function (assert) {
    this.contact = CONTACT;
    await renderDrawer();
    assert.dom('[data-test-input-first-name]').hasValue('Test');
    assert.dom('[data-test-input-email]').hasValue('user@example.com');
    assert.dom('[data-test-input-notes]').hasValue('Old notes');
    assert.dom('[data-test-input-is-whatsapp] input').isChecked();
    assert.dom('[data-test-save-contact]').hasText('Update');

    await fillIn('[data-test-input-company]', '');
    await fillIn('[data-test-input-notes]', 'New notes');
    await click('[data-test-save-contact]');

    const patch = sent(this.calls, 'PATCH');
    assert.strictEqual(patch.path, '/contacts/c-1');
    assert.deepEqual(patch.body, {
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      phone: '+971500000000',
      isWhatsapp: true,
      nationality: 'Emirati',
      nationalId: 'ID-1',
      contactCompany: null,
      jobTitle: 'Manager',
      address: 'Example Street',
      notes: 'New notes',
    });
    assert.deepEqual(this.toasts, [
      { type: 'success', message: 'Contact updated' },
    ]);
  });

  test('a failed save shows the server message and keeps the drawer open', async function (assert) {
    this.failWith = 'Phone already exists';
    this.contact = CONTACT;
    await renderDrawer();
    await click('[data-test-save-contact]');

    assert.dom('[data-test-error]').hasText('Phone already exists');
    assert.strictEqual(this.closed, 0);
    assert.strictEqual(this.saved, 0);
  });

  test('an edit draft and its error never leak into another contact', async function (assert) {
    this.failWith = 'Refused';
    this.contact = CONTACT;
    await renderDrawer();
    await fillIn('[data-test-input-first-name]', 'Edited');
    await click('[data-test-save-contact]');
    assert.dom('[data-test-error]').exists();

    this.set('contact', { ...CONTACT, id: 'c-2', firstName: 'Other' });
    assert.dom('[data-test-input-first-name]').hasValue('Other');
    assert.dom('[data-test-error]').doesNotExist();

    this.set('contact', null);
    assert.dom('[data-test-input-first-name]').hasValue('', 'create is empty');
    assert.dom('[data-test-error]').doesNotExist();
  });
});
