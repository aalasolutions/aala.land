import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

module(
  'Integration | Component | data-transfer/transfer-menu',
  function (hooks) {
    setupRenderingTest(hooks);

    hooks.beforeEach(function () {
      const context = this;
      this.role = 'company_admin';
      this.tier = 'PRO';
      this.transitions = [];
      this.templates = [];
      this.exports = [];
      this.owner.register(
        'service:session',
        class extends Service {
          get data() {
            return {
              authenticated: {
                user: { role: context.role },
                subscriptionTier: context.tier,
              },
            };
          }
        },
      );
      this.owner.register(
        'service:router',
        class extends Service {
          transitionTo(...args) {
            context.transitions.push(args);
          }
        },
      );
      this.owner.register(
        'service:data-transfer',
        class extends Service {
          async template(entity, format) {
            context.templates.push([entity, format]);
            throw new Error('stopped before download');
          }
        },
      );
      this.owner.register(
        'service:notifications',
        class extends Service {
          error() {}
          success() {}
        },
      );
    });

    test('a company admin on a paid plan gets Import plus the menu', async function (assert) {
      this.set('onExport', (format) => this.exports.push(format));
      await render(
        hbs`<DataTransfer::TransferMenu @entity="contacts" @importRoute="import.contacts" @onExport={{this.onExport}} />`,
      );
      assert.dom('[data-test-transfer-menu]').exists();
      assert.dom('[data-test-wu-split-button-primary]').hasText('Import');

      await click('[data-test-wu-split-button-primary]');
      assert.deepEqual(this.transitions, [['import.contacts']]);

      await click('[data-test-wu-split-button-trigger]');
      const menu = document.querySelector('[data-test-wu-dropdown-menu]');
      assert.ok(menu, 'the menu mounts on the page layer');
      assert.dom('[data-test-transfer-export="csv"]', menu).isEnabled();
      assert.dom('[data-test-transfer-export="xlsx"]', menu).isEnabled();
      assert.dom('[data-test-transfer-sample]', menu).isEnabled();

      await click(menu.querySelector('[data-test-transfer-export="xlsx"]'));
      assert.deepEqual(this.exports, ['xlsx'], 'export hands the format up');

      await click('[data-test-wu-split-button-trigger]');
      const reopened = document.querySelector('[data-test-wu-dropdown-menu]');
      await click(reopened.querySelector('[data-test-transfer-sample]'));
      assert.deepEqual(this.templates, [['contacts', 'csv']]);
      assert.dom('[data-test-upgrade-prompt]').doesNotExist();
    });

    test('a company admin on the free plan is shown the upgrade prompt instead', async function (assert) {
      this.tier = 'FREE';
      await render(
        hbs`<DataTransfer::TransferMenu @entity="contacts" @importRoute="import.contacts" />`,
      );

      await click('[data-test-wu-split-button-primary]');
      assert.deepEqual(this.transitions, []);
      assert.dom('[data-test-upgrade-prompt]').exists();

      await click('[data-test-wu-confirm-modal-cancel]');
      assert.dom('[data-test-upgrade-prompt]').doesNotExist();
    });

    test('without an import route only the export items are offered', async function (assert) {
      this.set('onExport', (format) => this.exports.push(format));
      await render(
        hbs`<DataTransfer::TransferMenu @entity="units" @onExport={{this.onExport}} />`,
      );
      assert.dom('[data-test-wu-split-button-primary]').isDisabled();
      assert.dom('[data-test-wu-split-button-trigger]').isEnabled();

      await click('[data-test-wu-split-button-trigger]');
      const menu = document.querySelector('[data-test-wu-dropdown-menu]');
      assert.dom('[data-test-transfer-export="csv"]', menu).isEnabled();
      assert.dom('[data-test-transfer-export="xlsx"]', menu).isEnabled();
      assert.dom('[data-test-transfer-sample]', menu).doesNotExist();

      await click(menu.querySelector('[data-test-transfer-export="csv"]'));
      assert.deepEqual(this.exports, ['csv']);
      assert.deepEqual(this.transitions, []);
      assert.deepEqual(this.templates, []);
    });

    test('other roles never see the control', async function (assert) {
      this.role = 'manager';
      await render(hbs`<DataTransfer::TransferMenu @entity="contacts" />`);
      assert.dom('[data-test-transfer-menu]').doesNotExist();
    });
  },
);
