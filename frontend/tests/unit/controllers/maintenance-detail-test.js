import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Controller | maintenance/detail', function (hooks) {
  setupTest(hooks);

  function controllerWith(owner, workOrder) {
    const controller = owner.lookup('controller:maintenance/detail');
    controller.model = { workOrder, unit: null, vendor: null, assignee: null };
    return controller;
  }

  test('the title reads the work order and falls back when missing', function (assert) {
    assert.strictEqual(
      controllerWith(this.owner, { id: 'wo-1', title: 'Fix AC' }).title,
      'Fix AC',
    );
    assert.strictEqual(controllerWith(this.owner, null).title, 'Work Order');
  });

  test('the panel is scoped to the work order and presets the link', function (assert) {
    const controller = controllerWith(this.owner, {
      id: 'wo-1',
      title: 'Fix AC',
    });
    assert.deepEqual(controller.documentFilters, { workOrderId: 'wo-1' });
    assert.deepEqual(controller.presetLink, {
      type: 'work_order',
      id: 'wo-1',
      label: 'Fix AC',
    });
  });

  test('no work order means no preset link', function (assert) {
    assert.strictEqual(controllerWith(this.owner, null).presetLink, null);
  });
});
