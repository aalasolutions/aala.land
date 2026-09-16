import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Helper | format-date', function (hooks) {
  setupRenderingTest(hooks);

  test('a date-only string renders its own calendar date with no shift', async function (assert) {
    this.set('value', '2026-09-16');
    await render(hbs`<span data-test-out>{{format-date this.value}}</span>`);
    assert.dom('[data-test-out]').hasText('Sep 16, 2026');
  });

  test('a date-only string honours the format argument', async function (assert) {
    this.set('value', '2026-01-01');
    await render(
      hbs`<span data-test-out>{{format-date this.value format="long"}}</span>`,
    );
    assert.dom('[data-test-out]').hasText('January 1, 2026');
  });

  test('an instant renders the browser-local date', async function (assert) {
    const value = '2026-09-16T23:30:00Z';
    this.set('value', value);
    await render(hbs`<span data-test-out>{{format-date this.value}}</span>`);
    const expected = new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    assert.dom('[data-test-out]').hasText(expected);
  });

  test('empty and invalid values render nothing', async function (assert) {
    this.set('value', 'not-a-date');
    await render(
      hbs`<span data-test-out>{{format-date this.value}}{{format-date null}}</span>`,
    );
    assert.dom('[data-test-out]').hasText('');
  });
});
