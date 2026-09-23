import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Controller | reports', function (hooks) {
  setupTest(hooks);

  function check(type, severity, total, listed = total) {
    return {
      type,
      label: `${type} label`,
      severity,
      total,
      flags: Array.from({ length: listed }, (_, i) => ({
        type,
        severity,
        message: `${type} ${i}`,
        entityType: 'Lead',
        entityId: `${type}-${i}`,
        createdAt: '2026-09-01T00:00:00Z',
      })),
    };
  }

  function makeController(ctx, model = {}) {
    const controller = ctx.owner.lookup('controller:reports');
    controller.model = {
      kpis: null,
      revenueTrend: [],
      agents: [],
      redFlags: [],
      activity: [],
      total: 0,
      funnel: [],
      ...model,
    };
    return controller;
  }

  test('an empty model does not break any getter', function (assert) {
    const controller = makeController(this);

    assert.deepEqual(controller.flagGroups, []);
    assert.deepEqual(controller.activityRows, []);
    assert.deepEqual(controller.revenuePoints, []);
    assert.strictEqual(controller.winRate, 0);
    assert.strictEqual(controller.currentTab, 'pipeline');
  });

  test('an unknown tab in the URL falls back to the first tab', function (assert) {
    const controller = makeController(this);
    controller.tab = 'nonsense';

    assert.strictEqual(controller.currentTab, 'pipeline');
  });

  test('groups follow the backend checks, capped at ten until expanded', function (assert) {
    const controller = makeController(this, {
      redFlags: [
        check('UNTOUCHED_LEAD_48H', 'HIGH', 12),
        check('LONG_VACANT', 'LOW', 0),
      ],
    });

    const [first, second] = controller.flagGroups;
    assert.strictEqual(first.label, 'UNTOUCHED_LEAD_48H label');
    assert.strictEqual(first.variant, 'danger');
    assert.strictEqual(first.severityLabel, 'High');
    assert.strictEqual(first.total, 12);
    assert.strictEqual(first.visible.length, 10);
    assert.strictEqual(first.hiddenCount, 2);
    assert.false(first.isTruncated);
    assert.strictEqual(second.total, 0);
    assert.strictEqual(second.variant, 'secondary');

    controller.showAllFlags('UNTOUCHED_LEAD_48H');

    assert.strictEqual(controller.flagGroups[0].visible.length, 12);
    assert.strictEqual(controller.flagGroups[0].hiddenCount, 0);
  });

  test('a check with more rows than listed reports its real total', function (assert) {
    const controller = makeController(this, {
      redFlags: [check('UNTOUCHED_LEAD_48H', 'HIGH', 200, 20)],
    });

    const [group] = controller.flagGroups;
    assert.strictEqual(group.total, 200);
    assert.strictEqual(group.listedCount, 20);
    assert.true(group.isTruncated);
  });

  test('an unknown severity falls back to the neutral variant', function (assert) {
    const controller = makeController(this, {
      redFlags: [check('SOMETHING_NEW', 'URGENT', 1)],
    });

    assert.strictEqual(controller.flagGroups[0].variant, 'secondary');
  });

  test('activity rows get a label and a tag variant', function (assert) {
    const controller = makeController(this, {
      activity: [
        { id: 'a1', action: 'BULK_DELETE', entityType: 'Unit' },
        { id: 'a2', action: 'EXPORT', entityType: 'Lead' },
      ],
    });

    const [bulk, exported] = controller.activityRows;
    assert.strictEqual(bulk.actionLabel, 'Bulk Delete');
    assert.strictEqual(bulk.actionVariant, 'danger');
    assert.strictEqual(exported.actionVariant, 'secondary');
  });

  test('win rate is won over all leads, rounded', function (assert) {
    const controller = makeController(this, {
      kpis: { totalLeads: 27, wonLeads: 3 },
    });

    assert.strictEqual(controller.winRate, 11);
  });

  test('the tab counts come from alerts and the activity total', function (assert) {
    const controller = makeController(this, {
      redFlags: [
        check('LONG_VACANT', 'LOW', 1),
        check('UNTOUCHED_LEAD_48H', 'HIGH', 57, 20),
      ],
      total: 201,
    });

    const counts = Object.fromEntries(
      controller.tabs.map((tab) => [tab.id, tab.count]),
    );
    assert.strictEqual(counts.alerts, 58);
    assert.strictEqual(counts.activity, 201);
    assert.deepEqual(
      controller.tabs.map((tab) => tab.label),
      ['Pipeline & Agents', 'Alerts', 'Activity Logs'],
    );
  });
});
