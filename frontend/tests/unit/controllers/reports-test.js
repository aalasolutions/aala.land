import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';

module('Unit | Controller | reports', function (hooks) {
  setupTest(hooks);

  function flag(type, severity, id) {
    return {
      type,
      severity,
      message: `${type} ${id}`,
      entityType: 'Lead',
      entityId: id,
      createdAt: '2026-09-01T00:00:00Z',
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

    assert.deepEqual(
      controller.flagGroups.map((group) => [group.type, group.count]),
      [
        ['UNTOUCHED_LEAD_48H', 0],
        ['UNTOUCHED_LEAD_24H', 0],
        ['STALLED_PIPELINE', 0],
        ['OVERDUE_FOLLOWUP', 0],
        ['LONG_VACANT', 0],
      ],
      'every check renders even when it found nothing',
    );
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

  test('flags group in fixed check order, capped at ten until expanded', function (assert) {
    const high = Array.from({ length: 12 }, (_, i) =>
      flag('UNTOUCHED_LEAD_48H', 'HIGH', `h${i}`),
    );
    const controller = makeController(this, {
      redFlags: [...high, flag('LONG_VACANT', 'LOW', 'u1')],
    });

    const first = controller.flagGroups[0];
    const second = controller.flagGroups.find(
      (group) => group.type === 'LONG_VACANT',
    );
    assert.strictEqual(first.label, 'Leads untouched for 48+ hours');
    assert.strictEqual(first.variant, 'danger');
    assert.strictEqual(first.count, 12);
    assert.strictEqual(first.visible.length, 10);
    assert.strictEqual(first.hiddenCount, 2);
    assert.strictEqual(second.count, 1);
    assert.strictEqual(second.variant, 'secondary');

    controller.showAllFlags('UNTOUCHED_LEAD_48H');

    assert.strictEqual(controller.flagGroups[0].visible.length, 12);
    assert.strictEqual(controller.flagGroups[0].hiddenCount, 0);
  });

  test('an unmapped flag type still gets a readable label', function (assert) {
    const controller = makeController(this, {
      redFlags: [flag('SOMETHING_NEW', 'MEDIUM', 'x1')],
    });

    const unmapped = controller.flagGroups.at(-1);
    assert.strictEqual(unmapped.label, 'Something New');
    assert.strictEqual(unmapped.variant, 'warning');
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
      redFlags: [flag('LONG_VACANT', 'LOW', 'u1')],
      total: 201,
    });

    const counts = Object.fromEntries(
      controller.tabs.map((tab) => [tab.id, tab.count]),
    );
    assert.strictEqual(counts.alerts, 1);
    assert.strictEqual(counts.activity, 201);
    assert.deepEqual(
      controller.tabs.map((tab) => tab.label),
      ['Pipeline & Agents', 'Alerts', 'Activity Logs'],
    );
  });
});
