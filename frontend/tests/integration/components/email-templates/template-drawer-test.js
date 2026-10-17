import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, render, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const TEMPLATE = {
  id: 'tpl-1',
  name: 'Rent Due',
  subject: 'Your rent is due',
  body: 'Hello {{firstName}}',
  category: 'PAYMENT_REMINDER',
  variables: ['firstName', 'amount'],
  isActive: false,
};

module(
  'Integration | Component | email-templates/template-drawer',
  function (hooks) {
    setupRenderingTest(hooks);

    hooks.beforeEach(function () {
      this.toasts = stubNotifications(this.owner);
      this.calls = stubAuth(this.owner, { respond: () => ({ data: {} }) });
      this.open = true;
      this.template = null;
      this.saved = 0;
      this.closed = 0;
      this.onSaved = () => this.saved++;
      this.onClose = () => this.closed++;
    });

    async function renderDrawer() {
      await render(
        hbs`<EmailTemplates::TemplateDrawer @open={{this.open}} @template={{this.template}} @onClose={{this.onClose}} @onSaved={{this.onSaved}} />`,
      );
      await waitFor('#t-name');
    }

    test('create posts the form with parsed variables', async function (assert) {
      await renderDrawer();
      assert.dom('[data-test-save-template]').hasText('Create Template');
      await fillIn('#t-name', 'Welcome');
      await fillIn('#t-subject', 'Hi there');
      await fillIn('#t-body', 'Welcome {{firstName}}');
      await fillIn('#t-vars', ' firstName, , unit ');
      await click('[data-test-save-template]');

      assert.deepEqual(this.calls, [
        {
          path: '/email-templates',
          method: 'POST',
          body: {
            name: 'Welcome',
            subject: 'Hi there',
            body: 'Welcome {{firstName}}',
            category: 'CUSTOM',
            variables: ['firstName', 'unit'],
            isActive: true,
          },
        },
      ]);
      assert.strictEqual(this.saved, 1);
      assert.strictEqual(this.closed, 1);
      assert.deepEqual(this.toasts, [
        { type: 'success', message: 'Template created' },
      ]);
    });

    test('edit prefills and patches the template', async function (assert) {
      this.template = TEMPLATE;
      await renderDrawer();
      assert.dom('#t-name').hasValue('Rent Due');
      assert.dom('#t-vars').hasValue('firstName, amount');
      assert.dom('[data-test-save-template]').hasText('Update');

      await fillIn('#t-subject', 'Rent reminder');
      await click('[data-test-save-template]');

      assert.strictEqual(this.calls[0].path, '/email-templates/tpl-1');
      assert.strictEqual(this.calls[0].method, 'PATCH');
      assert.deepEqual(this.calls[0].body, {
        name: 'Rent Due',
        subject: 'Rent reminder',
        body: 'Hello {{firstName}}',
        category: 'PAYMENT_REMINDER',
        variables: ['firstName', 'amount'],
        isActive: false,
      });
      assert.deepEqual(this.toasts, [
        { type: 'success', message: 'Template updated' },
      ]);
    });

    test('a failed save shows the server message and stays open', async function (assert) {
      stubAuth(this.owner, { respond: () => new Error('Name already used') });
      await renderDrawer();
      await fillIn('#t-name', 'Dup');
      await fillIn('#t-subject', 'S');
      await fillIn('#t-body', 'B');
      await click('[data-test-save-template]');

      assert.dom('[data-test-error]').hasText('Name already used');
      assert.strictEqual(this.saved, 0);
      assert.strictEqual(this.closed, 0);
    });

    test('empty required fields show errors under each field and block the save', async function (assert) {
      await renderDrawer();
      await click('[data-test-save-template]');

      assert.dom('[data-test-nu-field-error]').exists({ count: 3 });
      assert.strictEqual(this.calls.length, 0);

      await fillIn('#t-name', 'Welcome');
      assert.dom('[data-test-nu-field-error]').exists({ count: 2 });
    });

    test('an edit draft never leaks into another template', async function (assert) {
      this.template = TEMPLATE;
      await renderDrawer();
      await fillIn('#t-name', 'Edited A');
      this.set('template', { ...TEMPLATE, id: 'tpl-2', name: 'Template B' });
      assert.dom('#t-name').hasValue('Template B');

      this.set('template', null);
      assert.dom('#t-name').hasValue('', 'create starts empty');
    });
  },
);
