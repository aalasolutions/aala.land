import { module, test } from 'qunit';
import { settled } from '@ember/test-helpers';
import { setupTest } from 'land/tests/helpers';

module('Unit | Controller | table-options', function (hooks) {
  setupTest(hooks);

  test('search sits in the drawer, so the badge counts it and Clear resets it', function (assert) {
    const controller = this.owner.lookup('controller:table-options');
    controller.search = 'sara';

    assert.strictEqual(controller.activeFilterCount, 1);
    assert.true(controller.hasActiveFilters);

    controller.company = 'Example Holdings';

    assert.strictEqual(controller.activeFilterCount, 2);

    controller.clearFilters();

    assert.strictEqual(controller.search, '');
    assert.strictEqual(controller.activeFilterCount, 0);
    assert.false(controller.hasActiveFilters);
  });

  test('Clear cancels a pending search debounce', async function (assert) {
    const controller = this.owner.lookup('controller:table-options');
    controller.updateFilter('search', { target: { value: 'sara' } });
    controller.clearFilters();

    await settled();

    assert.strictEqual(controller.search, '');
  });
});
