import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { click, fillIn, render, waitFor } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import Service from '@ember/service';

const LOCALITY = {
  id: 'loc-1',
  name: 'Marina',
  city: { id: 'city-1', name: 'Dubai' },
};

module('Integration | Component | properties/asset-drawer', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    const calls = [];
    this.calls = calls;
    this.owner.register(
      'service:auth',
      class extends Service {
        async fetchJson(path, options = {}) {
          calls.push({ path, options });
          return { success: true, data: [] };
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

  test('create uses the preselected location', async function (assert) {
    this.locality = LOCALITY;
    await render(
      hbs`<Properties::AssetDrawer @open={{true}} @defaultLocality={{this.locality}} @onClose={{this.noop}} />`,
    );
    await waitFor('#asset-form');
    assert.dom('[data-test-asset-save]').hasText('Create Asset');

    await fillIn('#b-name', 'Tower A');
    await fillIn('#b-address', '1 Main Road');
    await click('[data-test-asset-save]');

    const post = sent(this.calls, 'POST');
    assert.strictEqual(post.path, '/properties/assets');
    assert.deepEqual(post.body, {
      name: 'Tower A',
      localityId: 'loc-1',
      address: '1 Main Road',
    });
  });

  test('create without a location is refused', async function (assert) {
    await render(
      hbs`<Properties::AssetDrawer @open={{true}} @onClose={{this.noop}} />`,
    );
    await waitFor('#asset-form');
    await fillIn('#b-name', 'Tower A');
    await click('[data-test-asset-save]');

    assert
      .dom('#asset-form [data-test-wu-field-error]')
      .hasText('Choose a city');
    assert.notOk(sent(this.calls, 'POST'));
  });

  test('edit prefills and patches without a locality', async function (assert) {
    this.asset = { id: 'asset-1', name: 'Bay Tower', address: null };
    await render(
      hbs`<Properties::AssetDrawer @open={{true}} @asset={{this.asset}} @onClose={{this.noop}} />`,
    );
    await waitFor('#asset-form');
    assert.dom('#b-name').hasValue('Bay Tower');
    assert.dom('[data-test-remote-autocomplete]').doesNotExist();

    await fillIn('#b-name', 'Bay Tower 2');
    await click('[data-test-asset-save]');

    const patch = sent(this.calls, 'PATCH');
    assert.strictEqual(patch.path, '/properties/assets/asset-1');
    assert.deepEqual(patch.body, { name: 'Bay Tower 2' });
  });

  test('an edit draft never leaks into another asset', async function (assert) {
    this.asset = { id: 'asset-1', name: 'Bay Tower' };
    await render(
      hbs`<Properties::AssetDrawer @open={{true}} @asset={{this.asset}} @onClose={{this.noop}} />`,
    );
    await waitFor('#asset-form');
    await fillIn('#b-name', 'Changed');
    this.set('asset', { id: 'asset-2', name: 'Palm Villa' });

    assert.dom('#b-name').hasValue('Palm Villa');
  });
});
