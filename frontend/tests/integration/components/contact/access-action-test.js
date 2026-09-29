import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import {
  httpError,
  stubAuth,
  stubNotifications,
} from 'land/tests/helpers/stub-auth';

module('Integration | Component | contact/access-action', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.toasts = stubNotifications(this.owner);
    this.contact = { id: 'c-1', accessLevel: 'LIMITED', accessPending: false };
  });

  test('asks for access with the contact id and then shows it pending', async function (assert) {
    const calls = stubAuth(this.owner, {
      respond: () => ({ data: { id: 'r-1' } }),
    });
    this.onRequested = (contact) => (this.requestedFor = contact.id);
    await render(
      hbs`<Contact::AccessAction @contact={{this.contact}} @onRequested={{this.onRequested}} />`,
    );

    await click('[data-test-request-access]');

    assert.deepEqual(calls, [
      {
        path: '/contact-access-requests',
        method: 'POST',
        body: { contactId: 'c-1' },
      },
    ]);
    assert.strictEqual(this.requestedFor, 'c-1');
    assert.strictEqual(this.toasts[0].type, 'success');
    assert.dom('[data-test-access-pending]').hasText('Access pending');
    assert.dom('[data-test-request-access]').doesNotExist();
  });

  test('a contact already waiting shows pending without a button', async function (assert) {
    stubAuth(this.owner);
    this.contact = { ...this.contact, accessPending: true };
    await render(hbs`<Contact::AccessAction @contact={{this.contact}} />`);

    assert.dom('[data-test-access-pending]').exists();
    assert.dom('[data-test-request-access]').doesNotExist();
  });

  test('@pending from the host also counts as waiting', async function (assert) {
    stubAuth(this.owner);
    await render(
      hbs`<Contact::AccessAction @contact={{this.contact}} @pending={{true}} />`,
    );

    assert.dom('[data-test-access-pending]').exists();
  });

  test('a failed request keeps the button and shows the server message', async function (assert) {
    stubAuth(this.owner, {
      respond: () => httpError(404, { message: 'Contact not found' }),
    });
    await render(hbs`<Contact::AccessAction @contact={{this.contact}} />`);

    await click('[data-test-request-access]');

    assert.deepEqual(this.toasts, [
      { type: 'error', message: 'Contact not found' },
    ]);
    assert.dom('[data-test-request-access]').exists();
  });
});
