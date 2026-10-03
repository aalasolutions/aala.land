import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | seat-note', function (hooks) {
  setupRenderingTest(hooks);

  test('FREE keeps the single-user note', async function (assert) {
    this.seatInfo = { tier: 'FREE', purchasedSeats: 1 };
    await render(hbs`<SeatNote @seatInfo={{this.seatInfo}} />`);
    assert.dom('[data-test-seat-note-free]').exists();
    assert.dom('[data-test-seat-note]').doesNotExist();
  });

  test('one seat is singular and the charge lands on the next bill', async function (assert) {
    this.seatInfo = { tier: 'PRO', purchasedSeats: 1 };
    await render(hbs`<SeatNote @seatInfo={{this.seatInfo}} />`);
    assert.dom('[data-test-seat-count]').hasText('1');
    assert
      .dom('[data-test-seat-note]')
      .hasText(
        'Your plan currently bills 1 seat. Adding a member adds one seat to your subscription. The charge is added to your next bill.',
      );
  });

  test('several seats are plural', async function (assert) {
    this.seatInfo = { tier: 'PRO', purchasedSeats: 4 };
    await render(hbs`<SeatNote @seatInfo={{this.seatInfo}} />`);
    assert
      .dom('[data-test-seat-note]')
      .hasText(
        'Your plan currently bills 4 seats. Adding a member adds one seat to your subscription. The charge is added to your next bill.',
      );
  });

  test('nothing renders without seat info', async function (assert) {
    this.seatInfo = null;
    await render(hbs`<SeatNote @seatInfo={{this.seatInfo}} />`);
    assert.dom('[data-test-seat-note]').doesNotExist();
    assert.dom('[data-test-seat-note-free]').doesNotExist();
  });
});
