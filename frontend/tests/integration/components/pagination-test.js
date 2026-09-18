import { module, test } from 'qunit';
import { setupRenderingTest } from 'land/tests/helpers';
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
      <Nuvo::Pagination
        @page={{this.page}}
        @limit={{this.limit}}
        @total={{this.total}}
        @onPrevious={{this.onPrevious}}
        @onNext={{this.onNext}}
        @onLimitChange={{this.onLimitChange}}
      />
    `);

    assert.dom('[data-test-nu-pagination-prev]').isDisabled();
    assert.dom('[data-test-nu-pagination-next]').isNotDisabled();

    this.set('page', '3');
    await settled();

    assert.dom('[data-test-nu-pagination-prev]').isNotDisabled();
    assert.dom('[data-test-nu-pagination-next]').isDisabled();
    assert.dom('[data-test-nu-pagination-status]').hasText('21-25 of 25');
  });

  test('it marks the current limit option as selected', async function (assert) {
    this.setProperties({
      page: 1,
      limit: '20',
      total: 100,
      onLimitChange: () => {},
      perPageOptions: [10, 20, 50],
    });

    await render(hbs`
      <Nuvo::Pagination
        @page={{this.page}}
        @limit={{this.limit}}
        @total={{this.total}}
        @perPageOptions={{this.perPageOptions}}
        @onLimitChange={{this.onLimitChange}}
      />
    `);

    assert.dom('[data-test-nu-pagination-select]').hasValue('20');
    assert.true(this.element.querySelector('option[value="20"]').selected);
  });

  test('it falls back to 10 per page when @limit is missing', async function (assert) {
    this.setProperties({
      page: 1,
      total: 25,
      onLimitChange: () => {},
    });

    await render(hbs`
      <Nuvo::Pagination
        @page={{this.page}}
        @total={{this.total}}
        @onLimitChange={{this.onLimitChange}}
      />
    `);

    assert.dom('[data-test-nu-pagination-status]').hasText('1-10 of 25');
    assert.dom('[data-test-nu-pagination-select]').hasValue('10');
    assert.true(this.element.querySelector('option[value="10"]').selected);
  });
});
