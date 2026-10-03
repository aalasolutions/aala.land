import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { localMidnightIso } from 'land/utils/local-date';

module('Unit | Controller | documents', function (hooks) {
  setupTest(hooks);

  test('panelFilters hands the URL filters to the panel', function (assert) {
    const controller = this.owner.lookup('controller:documents');
    controller.category = 'LEASE';
    controller.search = 'deed';
    controller.accessLevel = 'TEAM';
    controller.dateFrom = '2026-09-01';
    controller.dateTo = '2026-09-30';
    controller.related = 'lease';

    assert.deepEqual(controller.panelFilters, {
      category: 'LEASE',
      search: 'deed',
      accessLevel: 'TEAM',
      dateFrom: localMidnightIso('2026-09-01'),
      dateTo: localMidnightIso('2026-09-30', 1),
      related: 'lease',
    });
  });

  test('empty dates stay out of the filters', function (assert) {
    const controller = this.owner.lookup('controller:documents');

    assert.strictEqual(controller.panelFilters.dateFrom, null);
    assert.strictEqual(controller.panelFilters.dateTo, null);
  });

  test('the related filter counts as active, resets the page and clears', function (assert) {
    const controller = this.owner.lookup('controller:documents');
    controller.page = 3;

    controller.setRelated('none');
    assert.strictEqual(controller.related, 'none');
    assert.strictEqual(controller.page, 1);
    assert.true(controller.hasActiveFilters);

    controller.clearFilters();
    assert.strictEqual(controller.related, '');
    assert.false(controller.hasActiveFilters);
  });

  test('the query params include related and setPage moves the page', function (assert) {
    const controller = this.owner.lookup('controller:documents');

    assert.true(controller.queryParams.includes('related'));
    controller.setPage(4);
    assert.strictEqual(controller.page, 4);
  });

  test('resetState clears every filter', function (assert) {
    const controller = this.owner.lookup('controller:documents');
    controller.page = 2;
    controller.category = 'NOC';
    controller.related = 'unit';

    controller.resetState();
    assert.strictEqual(controller.page, 1);
    assert.strictEqual(controller.category, '');
    assert.strictEqual(controller.related, '');
  });
});
