import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | nuvo/toast-region', function (hooks) {
  setupRenderingTest(hooks);

  test('renders the toast region', async function (assert) {
    await render(hbs`<Nuvo::ToastRegion />`);
    assert.dom('[data-test-nu-toast-region]').exists();
  });

  test('shows toasts from notifications service', async function (assert) {
    const notifications = this.owner.lookup('service:notifications');
    notifications.success('Task complete!', 0);
    notifications.error('Something failed', 0);

    await render(hbs`<Nuvo::ToastRegion />`);

    assert.dom('[data-test-toast]').exists({ count: 2 });
  });

  test('maps service types onto kit variants', async function (assert) {
    const notifications = this.owner.lookup('service:notifications');
    notifications.error('Something failed', 0);
    notifications.success('Done', 0);

    await render(hbs`<Nuvo::ToastRegion />`);

    assert.dom('[data-test-toast-type="error"]').hasClass('m-danger');
    assert.dom('[data-test-toast-type="success"]').hasClass('m-success');
  });

  test('dismisses a toast', async function (assert) {
    const notifications = this.owner.lookup('service:notifications');
    notifications.info('Heads up', 0);

    await render(hbs`<Nuvo::ToastRegion />`);
    assert.dom('[data-test-toast]').exists({ count: 1 });

    await click('[data-test-toast-dismiss]');

    assert.dom('[data-test-toast]').doesNotExist();
  });

  test('applies a position modifier', async function (assert) {
    await render(hbs`<Nuvo::ToastRegion @position="top-end" />`);
    assert.dom('[data-test-nu-toast-region]').hasClass('m-top-end');
  });

  test('shows no toasts when service is empty', async function (assert) {
    await render(hbs`<Nuvo::ToastRegion />`);
    assert.dom('[data-test-toast]').doesNotExist();
  });
});
