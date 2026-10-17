import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, render, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const AGENTS = [
  { id: 'agent-1', name: 'Test Agent' },
  { id: 'agent-2', name: 'Other Agent' },
];

module(
  'Integration | Component | commissions/commission-drawer',
  function (hooks) {
    setupRenderingTest(hooks);

    hooks.beforeEach(function () {
      this.toasts = stubNotifications(this.owner);
      this.respond = () => ({ data: { id: 'com-1' } });
      this.calls = stubAuth(this.owner, {
        respond: (path, options) => this.respond(path, options),
      });
      this.agents = AGENTS;
      this.open = true;
      this.closed = 0;
      this.saved = 0;
      this.onClose = () => {
        this.closed += 1;
        this.set('open', false);
      };
      this.onSaved = () => (this.saved += 1);
    });

    async function renderDrawer() {
      await render(
        hbs`<Commissions::CommissionDrawer @open={{this.open}} @agents={{this.agents}} @onClose={{this.onClose}} @onSaved={{this.onSaved}} />`,
      );
      await waitFor('#commission-form');
    }

    async function pickOption(id, text) {
      await click(`#${id} [data-test-nu-dropdown-trigger]`);
      const item = [
        ...document.querySelectorAll(
          '.nu-menu.is-open [data-test-nu-dropdown-item]',
        ),
      ].find((el) => el.textContent.trim() === text);
      await click(item);
    }

    test('an agent is required before anything is sent', async function (assert) {
      await renderDrawer();
      await fillIn('#commission-gross', '1000');
      await fillIn('#commission-rate', '2');
      await click('[data-test-save-commission]');

      assert.dom('[data-test-nu-field-error]').hasText('Choose an agent');
      assert.strictEqual(this.calls.length, 0);
    });

    test('create posts the commission and hands off to the page', async function (assert) {
      await renderDrawer();
      assert.dom('[data-test-nu-drawer-title]').hasText('New Commission');
      await pickOption('commission-agent', 'Other Agent');
      await pickOption('commission-type', 'Rental');
      await fillIn('#commission-gross', '50000');
      await fillIn('#commission-rate', '2.5');
      await fillIn('#commission-notes', 'Q3 deal');
      await click('[data-test-save-commission]');

      assert.deepEqual(this.calls, [
        {
          path: '/commissions',
          method: 'POST',
          body: {
            agentId: 'agent-2',
            type: 'RENTAL',
            grossAmount: 50000,
            commissionRate: 2.5,
            notes: 'Q3 deal',
          },
        },
      ]);
      assert.deepEqual(this.toasts, [
        { type: 'success', message: 'Commission created' },
      ]);
      assert.strictEqual(this.closed, 1);
      assert.strictEqual(this.saved, 1);
    });

    test('type defaults to sale and empty notes are omitted', async function (assert) {
      await renderDrawer();
      await pickOption('commission-agent', 'Test Agent');
      await fillIn('#commission-gross', '100');
      await fillIn('#commission-rate', '1');
      await click('[data-test-save-commission]');

      assert.deepEqual(this.calls[0].body, {
        agentId: 'agent-1',
        type: 'SALE',
        grossAmount: 100,
        commissionRate: 1,
      });
    });

    test('a failed save keeps the drawer open with the message', async function (assert) {
      this.respond = () => new Error('Agent not found');
      await renderDrawer();
      await pickOption('commission-agent', 'Test Agent');
      await fillIn('#commission-gross', '100');
      await fillIn('#commission-rate', '1');
      await click('[data-test-save-commission]');

      assert.dom('[data-test-error]').hasText('Agent not found');
      assert.strictEqual(this.closed, 0);
      assert.strictEqual(this.saved, 0);
    });

    test('closing clears the draft and the error', async function (assert) {
      await renderDrawer();
      await fillIn('#commission-gross', '100');
      await fillIn('#commission-rate', '1');
      await click('[data-test-save-commission]');
      assert.dom('[data-test-nu-field-error]').hasText('Choose an agent');

      await click('[data-test-cancel-commission]');
      this.set('open', true);
      await waitFor('#commission-form');

      assert.dom('[data-test-nu-field-error]').doesNotExist();
      assert.dom('#commission-gross').hasValue('');
    });
  },
);
