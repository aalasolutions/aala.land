import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | toast-container', function (hooks) {
  setupRenderingTest(hooks);

  test('renders toast container', async function (assert) {
    await render(hbs`<ToastContainer />`);
    assert.dom('[data-test-toast-container]').exists();
  });

  test('shows toasts from notifications service', async function (assert) {
    const notifications = this.owner.lookup('service:notifications');
    notifications.success('Task complete!', 0);
    notifications.error('Something failed', 0);

    await render(hbs`<ToastContainer />`);

    assert.dom('[data-test-toast]').exists({ count: 2 });
  });

  test('shows no toasts when service is empty', async function (assert) {
    await render(hbs`<ToastContainer />`);
    assert.dom('[data-test-toast]').doesNotExist();
  });
});
