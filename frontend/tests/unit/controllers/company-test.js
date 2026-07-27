import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

const DAY = 24 * 60 * 60 * 1000;

module('Unit | Controller | company', function (hooks) {
  setupTest(hooks);

  function controllerWith(assigns) {
    const controller = this.owner.lookup('controller:company');
    Object.assign(controller, assigns);
    return controller;
  }

  test('creditUsageLabel is null until a limit is known', function (assert) {
    const controller = controllerWith.call(this, { creditsLimit: null });
    assert.strictEqual(controller.creditUsageLabel, null);
  });

  test('counts down the days to the period reset', function (assert) {
    const controller = controllerWith.call(this, {
      creditsLimit: 50,
      creditsUsed: 12,
      creditsResetsAt: new Date(Date.now() + 3 * DAY).toISOString(),
    });
    assert.true(
      controller.creditUsageLabel.startsWith(
        "You've used 12/50 AI credits this period",
      ),
    );
    assert.true(controller.creditUsageLabel.includes('resets in 3d'));
  });

  test('clamps an elapsed period to 0d instead of counting backwards', function (assert) {
    const controller = controllerWith.call(this, {
      creditsLimit: 50,
      creditsUsed: 50,
      creditsResetsAt: new Date(Date.now() - 5 * DAY).toISOString(),
    });
    assert.true(controller.creditUsageLabel.includes('resets in 0d'));
    assert.false(controller.creditUsageLabel.includes('resets in -'));
  });

  test('drops the countdown when the reset date is unparseable', function (assert) {
    const controller = controllerWith.call(this, {
      creditsLimit: 50,
      creditsUsed: 4,
      creditsResetsAt: 'not-a-date',
    });
    assert.strictEqual(
      controller.creditUsageLabel,
      "You've used 4/50 AI credits this period",
    );
    assert.false(controller.creditUsageLabel.includes('NaN'));
  });

  test('treats a missing used count as zero', function (assert) {
    const controller = controllerWith.call(this, {
      creditsLimit: 200,
      creditsUsed: null,
      creditsResetsAt: null,
    });
    assert.strictEqual(
      controller.creditUsageLabel,
      "You've used 0/200 AI credits this period",
    );
  });

  test('hasCreditAgents reflects the breakdown list', function (assert) {
    const controller = controllerWith.call(this, { creditAgents: [] });
    assert.false(controller.hasCreditAgents);
    controller.creditAgents = [{ userId: 'u1' }];
    assert.true(controller.hasCreditAgents);
  });
});
