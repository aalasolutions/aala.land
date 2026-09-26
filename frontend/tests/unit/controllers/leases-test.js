import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Controller | leases', function (hooks) {
  setupTest(hooks);

  test('the tenant picker labels a limited contact without printing undefined', function (assert) {
    const controller = this.owner.lookup('controller:leases');
    controller.model = {
      contacts: [
        { id: 'c-1', accessLevel: 'FULL', displayName: 'Sara Khan' },
        {
          id: 'c-9',
          accessLevel: 'LIMITED',
          firstName: 'Omar',
          lastInitial: 'H.',
          phoneMasked: '+971 50 *** **67',
        },
      ],
    };

    assert.deepEqual(
      controller.tenantOptions.map((o) => o.label),
      ['Select a tenant...', 'Sara Khan', 'Omar H.'],
    );
  });
});
