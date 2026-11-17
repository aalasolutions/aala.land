import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { fillIn, render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';

module('Integration | Component | pagination', function (hooks) {
  setupRenderingTest(hooks);

  test('it disables previous on the first page and next on the last page', async function (assert) {
    this.setProperties({
      page: '1',
      limit: '10',
      total: 25,
      onPrevious: () => {},
      onNext: () => {},
      onLimitChange: () => {},
    });

    await render(hbs`
      <Woven::Pagination
        @page={{this.page}}
        @limit={{this.limit}}
        @total={{this.total}}
        @onPrevious={{this.onPrevious}}
        @onNext={{this.onNext}}
        @onLimitChange={{this.onLimitChange}}
      />
    `);

    assert.dom('[data-test-wu-pagination-prev]').isDisabled();
    assert.dom('[data-test-wu-pagination-next]').isNotDisabled();

    this.set('page', '3');
    await settled();

    assert.dom('[data-test-wu-pagination-prev]').isNotDisabled();
    assert.dom('[data-test-wu-pagination-next]').isDisabled();
    assert.dom('[data-test-wu-pagination-status]').hasText('21-25 of 25');
  });

  test('it shows the current limit on the per-page select', async function (assert) {
    this.setProperties({
      page: 1,
      limit: '20',
      total: 100,
      onLimitChange: () => {},
      perPageOptions: [10, 20, 50],
    });

    await render(hbs`
      <Woven::Pagination
        @page={{this.page}}
        @limit={{this.limit}}
        @total={{this.total}}
        @perPageOptions={{this.perPageOptions}}
        @onLimitChange={{this.onLimitChange}}
      />
    `);

    assert.dom('[data-test-wu-pagination-select]').hasValue('20');
  });

  test('it reports the chosen per-page value as a number', async function (assert) {
    const calls = [];
    this.setProperties({
      onLimitChange: (value) => calls.push(value),
      perPageOptions: [10, 20, 50],
    });

    await render(hbs`
      <Woven::Pagination
        @page={{1}}
        @limit={{20}}
        @total={{100}}
        @perPageOptions={{this.perPageOptions}}
        @onLimitChange={{this.onLimitChange}}
      />
    `);

    await fillIn('[data-test-wu-pagination-select]', '50');

    assert.deepEqual(calls, [50]);
  });

  test('it falls back to 50 per page when @limit is missing', async function (assert) {
    this.setProperties({
      page: 1,
      total: 120,
      onLimitChange: () => {},
    });

    await render(hbs`
      <Woven::Pagination
        @page={{this.page}}
        @total={{this.total}}
        @onLimitChange={{this.onLimitChange}}
      />
    `);

    assert.dom('[data-test-wu-pagination-status]').hasText('1-50 of 120');
    assert.dom('[data-test-wu-pagination-select]').hasValue('50');
  });
});
