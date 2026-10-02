import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Controller | admin/system', function (hooks) {
  setupTest(hooks);

  test('rows show override countries and keep one id per price row', function (assert) {
    const controller = this.owner.lookup('controller:admin/system');
    controller.model = {
      rows: [
        { id: 'p1', kind: 'SEAT', currency: 'usd', countryCodes: null },
        { id: 'p2', kind: 'SEAT', currency: 'usd', countryCodes: ['IN', 'PK'] },
      ],
    };

    assert.deepEqual(
      controller.rows.map((r) => [r.id, r.label, r.countries]),
      [
        ['p1', 'SEAT / USD', '-'],
        ['p2', 'SEAT / USD', 'IN, PK'],
      ],
    );
    assert.ok(controller.columns.some((c) => c.valuePath === 'countries'));
  });
});
