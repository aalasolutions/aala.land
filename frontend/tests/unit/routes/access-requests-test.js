import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import Service from '@ember/service';
import { stubAuth } from 'land/tests/helpers/stub-auth';

// Routes carry no role guard, so this beforeModel is what keeps agents and accountants out.
module('Unit | Route | access-requests', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    const transitions = (this.transitions = []);
    this.owner.register(
      'service:session',
      class extends Service {
        isAuthenticated = true;
      },
    );
    this.owner.register(
      'service:router',
      class extends Service {
        transitionTo(name) {
          transitions.push(name);
        }
      },
    );
  });

  for (const role of ['agent', 'accountant']) {
    test(`${role} is sent to the dashboard`, async function (assert) {
      stubAuth(this.owner, { role });
      await this.owner.lookup('route:access-requests').beforeModel({});
      assert.deepEqual(this.transitions, ['dashboard']);
    });
  }

  for (const role of ['super_admin', 'company_admin', 'admin', 'manager']) {
    test(`${role} may open the page`, async function (assert) {
      stubAuth(this.owner, { role });
      await this.owner.lookup('route:access-requests').beforeModel({});
      assert.deepEqual(this.transitions, []);
    });
  }

  test('the list asks for pending requests by default', async function (assert) {
    const calls = stubAuth(this.owner, {
      role: 'manager',
      respond: () => ({ data: { data: [{ id: 'r-1' }], total: 1 } }),
    });
    const model = await this.owner.lookup('route:access-requests').model({});

    assert.strictEqual(
      calls[0].path,
      '/contact-access-requests?page=1&limit=50&status=PENDING',
    );
    assert.strictEqual(model.total, 1);
    assert.strictEqual(model.requests.length, 1);
  });
});
