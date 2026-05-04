import { module, test } from 'qunit';
import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, settled } from '@ember/test-helpers';
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
      <Pagination
        @page={{this.page}}
        @limit={{this.limit}}
        @total={{this.total}}
        @onPrevious={{this.onPrevious}}
        @onNext={{this.onNext}}
        @onLimitChange={{this.onLimitChange}}
      />
    `);

    assert.dom('.table-pagination__button').isDisabled();
    assert.dom('.table-pagination__button:last-of-type').isNotDisabled();

    this.set('page', '3');
    await settled();

    assert.dom('.table-pagination__button').isNotDisabled();
    assert.dom('.table-pagination__button:last-of-type').isDisabled();
    assert.dom('.table-pagination__status-value').hasText('3 / 3');
  });

  test('it marks the current limit option as selected', async function (assert) {
    this.setProperties({
      page: 1,
      limit: '20',
      total: 100,
      onPrevious: () => {},
      onNext: () => {},
      onLimitChange: () => {},
      limitOptions: [
        { value: '10', label: '10 rows' },
        { value: '20', label: '20 rows' },
        { value: '50', label: '50 rows' },
      ],
    });

    await render(hbs`
      <Pagination
        @page={{this.page}}
        @limit={{this.limit}}
        @total={{this.total}}
        @limitOptions={{this.limitOptions}}
        @onPrevious={{this.onPrevious}}
        @onNext={{this.onNext}}
        @onLimitChange={{this.onLimitChange}}
      />
    `);

    assert.dom('select').hasValue('20');
    assert.true(this.element.querySelector('option[value="20"]').selected);
  });

  test('it falls back to the first limit option when @limit is missing', async function (assert) {
    this.setProperties({
      page: 1,
      total: 25,
      onPrevious: () => {},
      onNext: () => {},
      onLimitChange: () => {},
      limitOptions: [
        { value: '10', label: '10 rows' },
        { value: '20', label: '20 rows' },
      ],
    });

    await render(hbs`
      <Pagination
        @page={{this.page}}
        @total={{this.total}}
        @limitOptions={{this.limitOptions}}
        @onPrevious={{this.onPrevious}}
        @onNext={{this.onNext}}
        @onLimitChange={{this.onLimitChange}}
      />
    `);

    assert.dom('.table-pagination__status-value').hasText('1 / 3');
    assert.dom('select').hasValue('10');
    assert.true(this.element.querySelector('option[value="10"]').selected);
  });
});
