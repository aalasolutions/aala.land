import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, render, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { stubAuth, stubNotifications } from 'land/tests/helpers/stub-auth';

const VENDOR = {
  id: 'v-1',
  name: 'Cool Air LLC',
  email: 'air@example.com',
  phone: '+971500000000',
  specialties: ['HVAC'],
  companyName: 'Cool Air',
  address: 'Industrial Area',
  hourlyRate: 120,
  rating: 4,
  notes: 'Fast',
  regionCode: 'DXB',
};

module('Integration | Component | vendors/vendor-drawer', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.calls = stubAuth(this.owner, { respond: () => ({ data: {} }) });
    this.toasts = stubNotifications(this.owner);
    const region = this.owner.lookup('service:region');
    region.regions = [
      { code: 'DXB', name: 'Dubai', currency: 'AED', countryName: 'UAE' },
      { code: 'LHR', name: 'Lahore', currency: 'PKR', countryName: 'Pakistan' },
    ];
    region.activeRegion = region.regions[0];
    this.open = true;
    this.vendor = null;
    this.saved = 0;
    this.closed = 0;
    this.onSaved = () => this.saved++;
    this.onClose = () => this.closed++;
  });

  async function renderDrawer() {
    await render(
      hbs`<Vendors::VendorDrawer @open={{this.open}} @vendor={{this.vendor}} @onClose={{this.onClose}} @onSaved={{this.onSaved}} />`,
    );
    await waitFor('#v-name');
  }

  function sent(calls, method) {
    return calls.find((c) => c.method === method);
  }

  test('create without a specialty is refused', async function (assert) {
    await renderDrawer();
    await fillIn('#v-name', 'New Vendor');
    await click('[data-test-save-vendor]');

    assert
      .dom('[data-test-nu-field-error]')
      .hasText('Choose a specialty');
    assert.notOk(sent(this.calls, 'POST'));
  });

  test('create posts the form with the active region', async function (assert) {
    await renderDrawer();
    assert
      .dom('[data-test-region-select]')
      .exists('two regions show the field');
    assert.dom('[data-test-save-vendor]').hasText('Create Vendor');

    await fillIn('#v-name', 'Spark Co');
    await click('[data-test-specialty-chip="ELECTRICAL"]');
    assert
      .dom('[data-test-specialty-chip="ELECTRICAL"]')
      .hasAttribute('aria-pressed', 'true');
    await fillIn('#v-rate', '99.5');
    await fillIn('#v-rating', '3');
    await click('[data-test-save-vendor]');

    const post = sent(this.calls, 'POST');
    assert.strictEqual(post.path, '/vendors');
    assert.deepEqual(post.body, {
      name: 'Spark Co',
      specialties: ['ELECTRICAL'],
      hourlyRate: 99.5,
      rating: 3,
      regionCode: 'DXB',
    });
    assert.strictEqual(this.saved, 1);
    assert.strictEqual(this.closed, 1);
    assert.deepEqual(this.toasts, [
      { type: 'success', message: 'Vendor created' },
    ]);
  });

  test('edit prefills and patches without a region', async function (assert) {
    this.vendor = VENDOR;
    await renderDrawer();
    assert.dom('#v-name').hasValue('Cool Air LLC');
    assert.dom('#v-rate').hasValue('120');
    assert.dom('#v-rating').hasValue('4');
    assert
      .dom('[data-test-specialty-chip="HVAC"]')
      .hasAttribute('aria-pressed', 'true');
    assert.dom('[data-test-save-vendor]').hasText('Update');

    await fillIn('#v-notes', 'Very fast');
    await click('[data-test-save-vendor]');

    const patch = sent(this.calls, 'PATCH');
    assert.strictEqual(patch.path, '/vendors/v-1');
    assert.deepEqual(patch.body, {
      name: 'Cool Air LLC',
      specialties: ['HVAC'],
      email: 'air@example.com',
      phone: '+971500000000',
      companyName: 'Cool Air',
      address: 'Industrial Area',
      hourlyRate: 120,
      rating: 4,
      notes: 'Very fast',
    });
  });

  test('a single region hides the region field', async function (assert) {
    const region = this.owner.lookup('service:region');
    region.regions = [region.regions[0]];
    await renderDrawer();
    assert.dom('[data-test-region-select]').doesNotExist();
  });

  test('an edit draft never leaks into another vendor', async function (assert) {
    this.vendor = VENDOR;
    await renderDrawer();
    await fillIn('#v-name', 'Edited A');
    this.set('vendor', { ...VENDOR, id: 'v-2', name: 'Vendor B' });
    assert.dom('#v-name').hasValue('Vendor B');

    this.set('vendor', null);
    assert.dom('#v-name').hasValue('', 'create starts empty');
  });
});
