import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | tenant-lock-banner', function (hooks) {
  setupRenderingTest(hooks);

  test('renders the error banner when locked', async function (assert) {
    this.set('lockState', {
      locked: true,
      lifted: false,
      liftUntil: null,
      dealExpiredAt: '2026-06-30T00:00:00.000Z',
    });
    await render(hbs`<TenantLockBanner @lockState={{this.lockState}} />`);

    assert.dom('[data-test-tenant-lock-banner]').exists();
    assert
      .dom('[data-test-tenant-lock-banner]')
      .containsText('You are over your limits. Reduce or pay to continue.');
    assert
      .dom('[data-test-tenant-lock-banner]')
      .containsText('readable and exportable');
    assert.dom('[data-test-tenant-grace-banner]').doesNotExist();
  });

  test('renders the grace banner with the date when lifted', async function (assert) {
    this.set('lockState', {
      locked: false,
      lifted: true,
      liftUntil: '2026-08-15T00:00:00.000Z',
      dealExpiredAt: '2026-06-30T00:00:00.000Z',
    });
    await render(hbs`<TenantLockBanner @lockState={{this.lockState}} />`);

    assert.dom('[data-test-tenant-grace-banner]').exists();
    assert
      .dom('[data-test-tenant-grace-banner]')
      .containsText('Your account is active until');
    assert
      .dom('[data-test-tenant-grace-banner]')
      .containsText('Settle before then to keep access');
    assert.dom('[data-test-tenant-lock-banner]').doesNotExist();
  });

  test('renders nothing when unlocked or absent', async function (assert) {
    this.set('lockState', {
      locked: false,
      lifted: false,
      liftUntil: null,
      dealExpiredAt: null,
    });
    await render(hbs`<TenantLockBanner @lockState={{this.lockState}} />`);
    assert.dom('[data-test-tenant-lock-banner]').doesNotExist();
    assert.dom('[data-test-tenant-grace-banner]').doesNotExist();

    this.set('lockState', null);
    assert.dom('[data-test-tenant-lock-banner]').doesNotExist();
    assert.dom('[data-test-tenant-grace-banner]').doesNotExist();
  });
});
