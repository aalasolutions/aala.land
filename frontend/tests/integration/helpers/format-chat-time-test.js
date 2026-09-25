import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

// Browser-local wall clock, so every case holds in any machine time zone.
function local(...parts) {
  return new Date(...parts).getTime();
}

// Friday 25 September 2026, noon.
const NOW = local(2026, 8, 25, 12, 0);

module('Integration | Helper | format-chat-time', function (hooks) {
  setupRenderingTest(hooks);

  async function renderAt(context, value, now = NOW) {
    context.set('value', value);
    context.set('now', now);
    await render(
      hbs`<span data-test-out>{{format-chat-time this.value now=this.now}}</span>`,
    );
  }

  test('today renders the time only', async function (assert) {
    await renderAt(this, local(2026, 8, 25, 16, 7));
    assert.dom('[data-test-out]').hasText('4:07 PM');
  });

  test('the previous calendar day renders Yesterday', async function (assert) {
    await renderAt(this, local(2026, 8, 24, 23, 59));
    assert.dom('[data-test-out]').hasText('Yesterday');
  });

  test('within the last six days renders the weekday', async function (assert) {
    await renderAt(this, local(2026, 8, 22, 10, 0));
    assert.dom('[data-test-out]').hasText('Tuesday', 'three days ago');

    await renderAt(this, local(2026, 8, 19, 10, 0));
    assert.dom('[data-test-out]').hasText('Saturday', 'six days ago');
  });

  test('a week or more ago in the same year renders month and day', async function (assert) {
    await renderAt(this, local(2026, 8, 18, 10, 0));
    assert.dom('[data-test-out]').hasText('Sep 18');
  });

  test('an older year renders the full date', async function (assert) {
    await renderAt(this, local(2025, 8, 18, 10, 0));
    assert.dom('[data-test-out]').hasText('Sep 18, 2025');
  });

  test('just after local midnight the day boundary is the browser calendar day', async function (assert) {
    const justAfterMidnight = local(2026, 8, 25, 0, 5);

    await renderAt(this, local(2026, 8, 25, 0, 1), justAfterMidnight);
    assert.dom('[data-test-out]').hasText('12:01 AM');

    await renderAt(this, local(2026, 8, 24, 23, 58), justAfterMidnight);
    assert.dom('[data-test-out]').hasText('Yesterday');
  });

  test('a stamp just past midnight while the clock still reads the day before is today', async function (assert) {
    await renderAt(
      this,
      local(2026, 11, 32, 0, 0, 30),
      local(2026, 11, 31, 23, 59, 40),
    );
    assert.dom('[data-test-out]').hasText('12:00 AM');
  });

  test('a missing value renders nothing', async function (assert) {
    await renderAt(this, null);
    assert.dom('[data-test-out]').hasNoText();

    await renderAt(this, undefined);
    assert.dom('[data-test-out]').hasNoText();
  });

  test('without now it measures against the current time', async function (assert) {
    this.set('value', Date.now());
    await render(
      hbs`<span data-test-out>{{format-chat-time this.value}}</span>`,
    );
    assert.dom('[data-test-out]').hasText(/^\d{1,2}:\d{2} [AP]M$/);
  });
});
