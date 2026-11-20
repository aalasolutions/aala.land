import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

module(
  'Integration | Component | data-transfer/upgrade-prompt',
  function (hooks) {
    setupRenderingTest(hooks);

    hooks.beforeEach(function () {
      const transitions = [];
      this.transitions = transitions;
      this.owner.register(
        'service:router',
        class extends Service {
          transitionTo(...args) {
            transitions.push(args);
          }
        },
      );
      this.closed = 0;
      this.set('onClose', () => (this.closed += 1));
    });

    test('explains the plan rule and sends the user to billing', async function (assert) {
      await render(hbs`
      <DataTransfer::UpgradePrompt @open={{true}} @onClose={{this.onClose}} />
    `);
      assert.dom('[data-test-upgrade-prompt]').exists();
      assert
        .dom('[data-test-wu-confirm-modal-message]')
        .hasText('This feature is on the Pro and Enterprise plans.');
      assert.dom('[data-test-wu-confirm-modal-confirm]').hasText('See plans');

      await click('[data-test-wu-confirm-modal-confirm]');

      assert.deepEqual(this.transitions, [
        ['company', { queryParams: { tab: 'billing' } }],
      ]);
      assert.strictEqual(this.closed, 1);
    });

    test('renders nothing while closed', async function (assert) {
      await render(hbs`
      <DataTransfer::UpgradePrompt @open={{false}} @onClose={{this.onClose}} />
    `);
      assert.dom('[data-test-upgrade-prompt]').doesNotExist();
    });
  },
);
