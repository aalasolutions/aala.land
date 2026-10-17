import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import {
  click,
  fillIn,
  focus,
  render,
  waitFor,
  waitUntil,
} from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

// Every unit form that attaches an owner sends the unlock number the same way.
module(
  'Integration | Component | properties/property-drawer owner verify phone',
  function (hooks) {
    setupRenderingTest(hooks);

    const LIMITED = {
      id: 'owner-9',
      accessLevel: 'LIMITED',
      firstName: 'Omar',
    };
    const FULL = { id: 'owner-1', accessLevel: 'FULL', firstName: 'Test' };

    hooks.beforeEach(function () {
      const sent = [];
      this.sent = sent;
      this.owner.register(
        'service:auth',
        class extends Service {
          async fetchJson(path, options = {}) {
            if (options.body) {
              sent.push({ path, body: JSON.parse(options.body) });
              return {};
            }
            if (path.startsWith('/contacts'))
              return { data: { data: [LIMITED] } };
            if (path.startsWith('/locations/cities/')) {
              return { data: [{ id: 'city-1', name: 'Dubai' }] };
            }
            if (path.startsWith('/locations/localities/')) {
              return { data: [{ id: 'loc-1', name: 'Marina' }] };
            }
            if (path.startsWith('/properties/assets/list')) {
              return { data: [{ id: 'asset-1', name: 'Bay Tower' }] };
            }
            return { data: [] };
          }
        },
      );
      this.owner.register(
        'service:region',
        class extends Service {
          regionCode = 'AE';
        },
      );
      this.owner.register(
        'service:notifications',
        class extends Service {
          success() {}
          error() {}
        },
      );
      this.noop = () => {};
    });

    async function pickFrom(root, label) {
      await focus(`${root} [data-test-nu-dropdown-filter]`);
      const selector = '.nu-menu.is-open [data-test-nu-dropdown-item]';
      await waitUntil(() => document.querySelector(selector));
      const item = [...document.querySelectorAll(selector)].find((el) =>
        el.textContent.includes(label),
      );
      await click(item);
    }

    async function pickLocation() {
      const filters = () =>
        document.querySelectorAll(
          '[data-test-remote-autocomplete] [data-test-nu-dropdown-filter]',
        );
      const selector = '.nu-menu.is-open [data-test-nu-dropdown-item]';
      for (const [index, label] of [
        [0, 'Dubai'],
        [1, 'Marina'],
        [2, 'Bay Tower'],
      ]) {
        await focus(filters()[index]);
        await waitUntil(() => document.querySelector(selector));
        await click(
          [...document.querySelectorAll(selector)].find((el) =>
            el.textContent.includes(label),
          ),
        );
      }
    }

    async function pickKind() {
      await click('[data-test-unit-kind] [data-test-nu-dropdown-trigger]');
      const item = [
        ...document.querySelectorAll('[data-test-nu-dropdown-item]'),
      ].find((el) => el.textContent.includes('Apartment'));
      await click(item);
    }

    async function pickLimitedOwner() {
      await pickFrom('[data-test-contact-search]', 'Omar');
      await fillIn('[data-test-contact-verify-phone]', '0501234567');
    }

    test('new unit from the properties list', async function (assert) {
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="list" @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      await pickLocation();
      await fillIn('#unit-number', '101');
      await pickKind();
      await pickLimitedOwner();
      await click('[data-test-unit-save]');

      assert.strictEqual(this.sent[0].body.ownerId, 'owner-9');
      assert.strictEqual(this.sent[0].body.ownerVerifyPhone, '0501234567');
      assert.strictEqual(this.sent[0].body.subType, 'APARTMENT');
    });

    test('a unit needs a kind before it is saved', async function (assert) {
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="list" @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      await pickLocation();
      await fillIn('#unit-number', '101');
      await pickLimitedOwner();
      await click('[data-test-unit-save]');

      assert
        .dom(
          '[data-test-nu-field]:has(#unit-sub-type) [data-test-nu-field-error]',
        )
        .hasText('Choose the property kind.');
      assert.strictEqual(this.sent.length, 0);
    });

    test('unit drawer on the asset page', async function (assert) {
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="asset" @assetId="asset-1" @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      await fillIn('#unit-number', '102');
      await pickKind();
      await pickLimitedOwner();
      await click('[data-test-unit-save]');

      assert.strictEqual(this.sent[0].body.ownerId, 'owner-9');
      assert.strictEqual(this.sent[0].body.ownerVerifyPhone, '0501234567');
    });

    test('edit on the unit page, and a full owner sends no number', async function (assert) {
      this.unit = { id: 'unit-1', unitNumber: '101', subType: 'APARTMENT', owner: LIMITED };
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="unit" @unit={{this.unit}} @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      await fillIn('[data-test-contact-verify-phone]', '0501234567');
      await click('[data-test-unit-save]');
      assert.strictEqual(this.sent[0].body.ownerVerifyPhone, '0501234567');

      this.set('unit', { id: 'unit-2', unitNumber: '102', subType: 'APARTMENT', owner: FULL });
      assert.dom('[data-test-contact-verify-phone]').doesNotExist();
      await click('[data-test-unit-save]');
      assert.strictEqual(this.sent[1].body.ownerId, 'owner-1');
      assert.false('ownerVerifyPhone' in this.sent[1].body);
    });
  },
);
