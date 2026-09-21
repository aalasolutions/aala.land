import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

// The controller is a singleton, so entering the page must reset its panel state.
module('Unit | Route | company', function (hooks) {
  setupTest(hooks);

  const COMPANY = {
    name: 'Test Company',
    activeRegions: ['dxb', 'auh'],
    defaultRegionCode: 'dxb',
  };

  function setup(ctx, model) {
    const route = ctx.owner.lookup('route:company');
    const controller = ctx.owner.lookup('controller:company');
    route.setupController(controller, model);
    return controller;
  }

  test('the saved regions seed the pending edit', function (assert) {
    const controller = setup(this, { company: COMPANY });

    assert.strictEqual(controller.formName, 'Test Company');
    assert.deepEqual(controller.formActiveRegions, ['dxb', 'auh']);
    assert.strictEqual(controller.formDefaultRegionCode, 'dxb');
  });

  test('a company with no regions yet starts empty rather than undefined', function (assert) {
    const controller = setup(this, { company: { name: null } });

    assert.strictEqual(controller.formName, '');
    assert.deepEqual(controller.formActiveRegions, []);
  });

  test('entering the page puts the default panel back', function (assert) {
    const controller = this.owner.lookup('controller:company');
    controller.activeTab = 'billing';

    const route = this.owner.lookup('route:company');
    route.setupController(controller, { company: COMPANY });

    assert.strictEqual(controller.activeTab, 'general');
  });

  test('a tab asked for in the URL survives the reset', function (assert) {
    const controller = this.owner.lookup('controller:company');
    controller.tab = 'regions';

    const route = this.owner.lookup('route:company');
    route.setupController(controller, { company: COMPANY });

    assert.strictEqual(controller.tab, 'regions');
    assert.strictEqual(controller.currentTab, 'regions', 'and still wins');
  });

  test('an operator with no company gets a cleared form, not the last one', function (assert) {
    const controller = this.owner.lookup('controller:company');
    controller.formName = 'stale';
    controller.formActiveRegions = ['makkah'];
    controller.formDefaultRegionCode = 'makkah';

    const route = this.owner.lookup('route:company');
    route.setupController(controller, null);

    // The controller is a singleton, so leaving these set shows one company's data under another.
    assert.strictEqual(controller.formName, '');
    assert.deepEqual(controller.formActiveRegions, []);
    assert.strictEqual(controller.formDefaultRegionCode, null);
    assert.strictEqual(controller.storageUsage, null);
    assert.strictEqual(controller.billing, null);
    assert.deepEqual(controller.creditAgents, []);
  });

  test('billing history is unwrapped, with paging defaults when it is missing', function (assert) {
    const controller = setup(this, {
      company: COMPANY,
      billingHistory: {
        data: { data: [{ id: 'p1' }], total: 3, page: 2, limit: 10 },
      },
    });

    assert.deepEqual(controller.billingHistory, [{ id: 'p1' }]);
    assert.strictEqual(controller.billingHistoryTotal, 3);
    assert.strictEqual(controller.billingHistoryPage, 2);
    assert.strictEqual(controller.billingHistoryLimit, 10);

    const empty = setup(this, { company: COMPANY });
    assert.deepEqual(empty.billingHistory, []);
    assert.strictEqual(empty.billingHistoryTotal, 0);
    assert.strictEqual(empty.billingHistoryPage, 1);
    assert.strictEqual(empty.billingHistoryLimit, 50);
  });

  test('the AI panel is seeded and its messages cleared', function (assert) {
    const controller = this.owner.lookup('controller:company');
    controller.aiSuccessMsg = 'stale';
    controller.aiErrorMsg = 'stale';

    const route = this.owner.lookup('route:company');
    route.setupController(controller, {
      company: COMPANY,
      ai: {
        aiPrompt: 'Answer in Arabic',
        creditsLimit: 50,
        creditsUsed: 4,
        creditAgents: [{ userId: 'u1' }],
      },
    });

    assert.strictEqual(controller.aiPrompt, 'Answer in Arabic');
    assert.strictEqual(controller.creditsLimit, 50);
    assert.strictEqual(controller.creditsUsed, 4);
    assert.strictEqual(controller.creditsResetsAt, null);
    assert.deepEqual(controller.creditAgents, [{ userId: 'u1' }]);
    assert.strictEqual(controller.aiSuccessMsg, '');
    assert.strictEqual(controller.aiErrorMsg, '');
  });
});
