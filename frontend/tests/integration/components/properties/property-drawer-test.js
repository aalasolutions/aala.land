import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, focus, render, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

const UNIT = {
  id: 'unit-1',
  unitNumber: '101',
  status: 'rented',
  propertyType: 'RENTAL',
  subType: 'APARTMENT',
  price: 5000,
  sqFt: 850,
  bedrooms: 2,
  bathrooms: 1.5,
  floor: 3,
  description: 'Corner flat',
  amenities: ['pool'],
  owner: { id: 'owner-1', displayName: 'Test User', accessLevel: 'FULL' },
};

module(
  'Integration | Component | properties/property-drawer',
  function (hooks) {
    setupRenderingTest(hooks);

    hooks.beforeEach(function () {
      const calls = [];
      this.calls = calls;
      this.owner.register(
        'service:auth',
        class extends Service {
          async fetchJson(path, options = {}) {
            calls.push({ path, options });
            if (path.startsWith('/locations/cities/')) {
              return { data: [{ id: 'city-1', name: 'Dubai' }] };
            }
            if (path.startsWith('/locations/localities/')) {
              return { data: [{ id: 'loc-1', name: 'Marina' }] };
            }
            if (path.startsWith('/properties/assets/list')) {
              return { data: [{ id: 'asset-9', name: 'Bay Tower' }] };
            }
            return { success: true, data: {} };
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

    function sent(calls, method) {
      const call = calls.find((c) => c.options.method === method);
      return call && { path: call.path, body: JSON.parse(call.options.body) };
    }

    async function pickOption(selector, label) {
      await click(`${selector} [data-test-nu-dropdown-trigger]`);
      const item = [
        ...document.querySelectorAll('[data-test-nu-dropdown-item]'),
      ].find((el) => el.textContent.includes(label));
      await click(item);
    }

    async function pickAutocomplete(index, label) {
      const filters = document.querySelectorAll(
        '[data-test-remote-autocomplete] [data-test-nu-dropdown-filter]',
      );
      await focus(filters[index]);
      const item = [
        ...document.querySelectorAll(
          '.nu-menu.is-open [data-test-nu-dropdown-item]',
        ),
      ].find((el) => el.textContent.includes(label));
      await click(item);
    }

    async function typeOwner() {
      await click('[data-test-contact-add-new]');
      await fillIn('[data-test-contact-first-name]', 'Test');
    }

    test('list: fields wait for an asset, then the create body carries it', async function (assert) {
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="list" @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      assert.dom('[data-test-unit-number]').doesNotExist();
      assert.dom('[data-test-unit-save]').doesNotExist();

      await pickAutocomplete(0, 'Dubai');
      await pickAutocomplete(1, 'Marina');
      await pickAutocomplete(2, 'Bay Tower');

      assert.dom('#unit-number').hasAttribute('required');
      assert.dom('[data-test-unit-sqft]').doesNotExist();
      assert.dom('[data-test-amenity]').doesNotExist();

      await fillIn('#unit-number', ' 101 ');
      await click('[data-test-unit-save]');
      assert
        .dom('#property-form .text-danger')
        .hasText('Choose the property kind.');

      await pickOption('#unit-sub-type', 'Villa');
      await fillIn('#unit-price', '1200');
      await typeOwner();
      await click('[data-test-unit-save]');

      const post = sent(this.calls, 'POST');
      assert.strictEqual(post.path, '/properties/units');
      assert.deepEqual(post.body, {
        assetId: 'asset-9',
        unitNumber: '101',
        status: 'available',
        subType: 'VILLA',
        price: 1200,
        owner: { firstName: 'Test' },
      });
    });

    test('list: a blank number is refused before the kind', async function (assert) {
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="list" @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      await pickAutocomplete(0, 'Dubai');
      await pickAutocomplete(1, 'Marina');
      await pickAutocomplete(2, 'Bay Tower');

      await fillIn('#unit-number', '   ');
      await click('[data-test-unit-save]');
      assert
        .dom('#property-form .text-danger')
        .hasText('Property number is required.');
      assert.notOk(sent(this.calls, 'POST'));
    });

    test('asset: create posts to the given asset with amenities', async function (assert) {
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="asset" @assetId="asset-1" @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      assert.dom('[data-test-unit-save]').hasText('Create Property');

      await fillIn('#unit-number', '202');
      await pickOption('#unit-sub-type', 'Office');
      await typeOwner();
      await click('[data-test-amenity="pool"]');
      await click('[data-test-unit-save]');

      const post = sent(this.calls, 'POST');
      assert.deepEqual(post.body, {
        assetId: 'asset-1',
        unitNumber: '202',
        status: 'available',
        subType: 'OFFICE_SPACE',
        owner: { firstName: 'Test' },
        amenities: ['pool'],
      });
    });

    test('asset: edit prefills and patches, clearing an unset listing type', async function (assert) {
      this.unit = UNIT;
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="asset" @unit={{this.unit}} @assetId="asset-1" @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      assert.dom('#unit-number').hasValue('101');
      assert.dom('#unit-price').hasValue('5000');
      assert.dom('#unit-baths').hasValue('1.5');
      assert.dom('[data-test-unit-floor]').doesNotExist();
      assert.dom('[data-test-unit-save]').hasText('Update');

      await pickOption('#unit-property-type', 'Not Listed');
      await click('[data-test-unit-save]');

      const patch = sent(this.calls, 'PATCH');
      assert.strictEqual(patch.path, '/properties/units/unit-1');
      assert.deepEqual(patch.body, {
        unitNumber: '101',
        status: 'rented',
        subType: 'APARTMENT',
        propertyType: null,
        price: 5000,
        sqFt: 850,
        bedrooms: 2,
        bathrooms: 1.5,
        ownerId: 'owner-1',
        amenities: ['pool'],
      });
    });

    test('unit: edit sends floor and description', async function (assert) {
      this.unit = UNIT;
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="unit" @unit={{this.unit}} @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      assert.dom('[data-test-unit-floor]').hasValue('3');
      assert
        .dom('[data-test-unit-number]')
        .doesNotHaveAttribute('required');
      assert.dom('[data-test-amenities-picker]').exists();
      assert.dom('[data-test-unit-save]').hasText('Update Property');

      await fillIn('[data-test-unit-description]', 'Sea view');
      await click('[data-test-unit-save]');

      const patch = sent(this.calls, 'PATCH');
      assert.strictEqual(patch.body.floor, '3');
      assert.strictEqual(patch.body.description, 'Sea view');
      assert.strictEqual(patch.body.propertyType, 'RENTAL');
    });

    test('unit: an owner is required', async function (assert) {
      this.unit = { ...UNIT, owner: null };
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="unit" @unit={{this.unit}} @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      await click('[data-test-unit-save]');

      assert
        .dom('[data-test-error]')
        .hasText(
          'Select an owner from contacts, or enter a name, phone or email to create one.',
        );
      assert.notOk(sent(this.calls, 'PATCH'));
    });

    test('an edit draft never leaks into another record', async function (assert) {
      this.unit = UNIT;
      await render(
        hbs`<Properties::PropertyDrawer @open={{true}} @variant="asset" @unit={{this.unit}} @onClose={{this.noop}} />`,
      );
      await waitFor('#property-form');
      await fillIn('#unit-number', '999');
      this.set('unit', { ...UNIT, id: 'unit-2', unitNumber: '305' });

      assert.dom('#unit-number').hasValue('305');
    });
  },
);
