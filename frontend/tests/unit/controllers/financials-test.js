import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import {
  formatCalendarDate,
  localDateString,
  resolveRange,
  todayInZone,
} from 'land/utils/local-date';

// UTC+14 and UTC-11 are always on different dates, so one differs from the browser date.
const FAR_ZONES = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'];

function zoneAheadOfBrowser() {
  return FAR_ZONES.find((tz) => todayInZone(tz) !== localDateString());
}

module('Unit | Controller | financials', function (hooks) {
  setupTest(hooks);

  // Samples the expected date on both sides of the call so a midnight rollover cannot flake.
  function assertToday(assert, controller, expectedFn) {
    const before = expectedFn();
    controller.openCreate();
    const after = expectedFn();
    assert.true(
      [before, after].includes(controller.formDate),
      `formDate ${controller.formDate} is ${before} or ${after}`,
    );
  }

  test('openCreate defaults the date to today in the active region zone', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    const zone = zoneAheadOfBrowser();
    controller.region.activeRegion = { code: 'far', timezone: zone };
    assertToday(assert, controller, () => todayInZone(zone));
    assert.notStrictEqual(controller.formDate, localDateString());
  });

  test('openCreate falls back to the browser-local date without an active region', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.region.activeRegion = null;
    assertToday(assert, controller, () => localDateString());
  });

  // A bad pair is rejected here because the server rejects it too.
  module('date range', function () {
    const BOUNDS = { from: '2026-09-01', to: '2026-09-30' };

    function makeController(ctx, assigns = {}) {
      const controller = ctx.owner.lookup('controller:financials');
      Object.assign(controller, assigns);
      return controller;
    }

    // Mirrors how a date input reports a change: the element holds the value.
    function inputEvent(value) {
      return { target: { value } };
    }

    test('switching to custom seeds the window from the period on screen', function (assert) {
      const controller = makeController(this, {
        model: { bounds: BOUNDS },
        page: 4,
      });

      controller.setRange('custom');

      assert.strictEqual(controller.from, BOUNDS.from);
      assert.strictEqual(controller.to, BOUNDS.to);
      assert.true(controller.isCustomRange);
      assert.strictEqual(controller.page, 1, 'paging restarts');
    });

    test('leaving custom clears the window so the preset decides', function (assert) {
      const controller = makeController(this, {
        model: { bounds: BOUNDS },
        rangeError: 'stale message',
      });
      controller.setRange('custom');

      controller.setRange('last7');

      assert.strictEqual(controller.from, null);
      assert.strictEqual(controller.to, null);
      assert.strictEqual(controller.rangeError, '');
      assert.false(controller.isCustomRange);
    });

    test('a complete date is accepted and restarts paging', function (assert) {
      const controller = makeController(this, {
        range: 'custom',
        from: '2026-09-01',
        to: '2026-09-30',
        page: 3,
        rangeError: 'stale message',
      });

      controller.setRangeBound('from', '2026-09-05', inputEvent('2026-09-05'));

      assert.strictEqual(controller.from, '2026-09-05');
      assert.strictEqual(controller.rangeError, '');
      assert.strictEqual(controller.page, 1);
    });

    test('a half-typed date is refused and the input is put back', function (assert) {
      const controller = makeController(this, {
        range: 'custom',
        from: '2026-09-01',
        to: '2026-09-30',
      });
      const event = inputEvent('2026-09');

      controller.setRangeBound('from', '2026-09', event);

      assert.strictEqual(controller.from, '2026-09-01', 'unchanged');
      assert.strictEqual(
        controller.rangeError,
        'Enter a complete date for both ends of the range.',
      );
      assert.strictEqual(event.target.value, '2026-09-01', 'the field reverts');
    });

    test('a date that does not exist is refused', function (assert) {
      const controller = makeController(this, {
        range: 'custom',
        from: '2026-09-01',
        to: '2026-09-30',
      });

      controller.setRangeBound('to', '2026-02-31', inputEvent('2026-02-31'));

      assert.strictEqual(controller.to, '2026-09-30', 'unchanged');
      assert.strictEqual(
        controller.rangeError,
        'Enter a complete date for both ends of the range.',
      );
    });

    test('an inverted range is refused rather than silently swapped', function (assert) {
      const controller = makeController(this, {
        range: 'custom',
        from: '2026-09-10',
        to: '2026-09-30',
      });
      const event = inputEvent('2026-09-01');

      controller.setRangeBound('to', '2026-09-01', event);

      assert.strictEqual(controller.to, '2026-09-30', 'the end date stands');
      assert.strictEqual(
        controller.rangeError,
        'Start date must be on or before the end date.',
      );
      assert.strictEqual(event.target.value, '2026-09-30', 'the field reverts');

      controller.setRangeBound('from', '2026-10-01', inputEvent('2026-10-01'));
      assert.strictEqual(
        controller.from,
        '2026-09-10',
        'the start date stands',
      );
      assert.strictEqual(
        controller.rangeError,
        'Start date must be on or before the end date.',
      );
    });

    test('the two ends may meet on the same day', function (assert) {
      const controller = makeController(this, {
        range: 'custom',
        from: '2026-09-10',
        to: '2026-09-30',
      });

      controller.setRangeBound('to', '2026-09-10', inputEvent('2026-09-10'));

      assert.strictEqual(controller.to, '2026-09-10');
      assert.strictEqual(controller.rangeError, '');
    });

    test('a half-open range is accepted so the second date can still be typed', function (assert) {
      const controller = makeController(this, {
        range: 'custom',
        from: null,
        to: null,
      });

      controller.setRangeBound('to', '2026-09-01', inputEvent('2026-09-01'));

      assert.strictEqual(controller.to, '2026-09-01');
      assert.strictEqual(controller.rangeError, '');
    });

    test('an empty field reverts to nothing rather than to "null"', function (assert) {
      const controller = makeController(this, { range: 'custom', from: null });
      const event = inputEvent('');

      controller.setRangeBound('from', '', event);

      assert.strictEqual(controller.from, null);
      assert.strictEqual(event.target.value, '');
    });

    test('bounds reports what the API was queried with', function (assert) {
      const controller = makeController(this, {
        model: { bounds: BOUNDS },
        range: 'last7',
      });

      assert.deepEqual(controller.bounds, BOUNDS, 'not the local guess');
    });

    test('bounds falls back to the resolved range before the model lands', function (assert) {
      const controller = makeController(this, {
        model: null,
        range: 'custom',
        from: '2026-09-10',
        to: '2026-09-01',
      });

      assert.deepEqual(
        controller.bounds,
        resolveRange('custom', '2026-09-10', '2026-09-01'),
        'the reversed pair is ordered for the query',
      );
      assert.deepEqual(controller.bounds, {
        from: '2026-09-01',
        to: '2026-09-10',
      });
    });

    test('the fallback bounds pivot on the region day, not the browser day', function (assert) {
      const zone = zoneAheadOfBrowser();
      const controller = makeController(this, { model: null, range: 'last7' });
      controller.region.activeRegion = { code: 'far', timezone: zone };

      // Samples both sides of the read so a midnight rollover cannot flake it.
      const before = todayInZone(zone);
      const { to } = controller.bounds;
      const after = todayInZone(zone);

      assert.true([before, after].includes(to), `${to} is the region day`);
      assert.notStrictEqual(to, localDateString(), 'not the browser day');
    });

    test('the fallback bounds fall back to browser-local without an active region', function (assert) {
      const controller = makeController(this, { model: null, range: 'last7' });
      controller.region.activeRegion = null;

      assert.deepEqual(
        controller.bounds,
        resolveRange('last7', null, null, new Date(), undefined),
      );
    });

    test('rangeLabel names the month for a month preset', function (assert) {
      const controller = makeController(this, {
        model: { bounds: { from: '2026-08-01', to: '2026-08-31' } },
        range: 'lastMonth',
      });

      assert.strictEqual(
        controller.rangeLabel,
        formatCalendarDate('2026-08-01', navigator.language || 'en', {
          month: 'long',
          year: 'numeric',
        }),
      );
    });

    test('rangeLabel uses the option label for a day preset', function (assert) {
      const controller = makeController(this, { range: 'last30' });

      assert.strictEqual(controller.rangeLabel, 'Last 30 days');
    });

    test('rangeLabel spells out both ends of a custom window', function (assert) {
      const controller = makeController(this, {
        model: { bounds: BOUNDS },
        range: 'custom',
      });
      const day = (date) =>
        formatCalendarDate(date, navigator.language || 'en', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });

      assert.strictEqual(
        controller.rangeLabel,
        `${day(BOUNDS.from)} to ${day(BOUNDS.to)}`,
      );
    });

    test('rangeLabel shows the raw date when it cannot be formatted', function (assert) {
      const controller = makeController(this, {
        model: { bounds: { from: 'garbage', to: 'garbage' } },
        range: 'custom',
      });

      assert.strictEqual(controller.rangeLabel, 'garbage to garbage');
    });
  });

  module('cashflow series', function () {
    const CASHFLOW = [
      {
        month: '2026-01',
        from: '2026-01-01',
        to: '2026-01-31',
        income: '1000.50',
        expense: '400',
      },
      {
        month: '2026-02',
        from: '2026-02-01',
        to: '2026-02-28',
        income: null,
        expense: 'not a number',
      },
    ];

    const BLOCKS = [
      { from: '2026-09-08', to: '2026-09-14', income: '200', expense: '50' },
      { from: '2026-09-15', to: '2026-09-21', income: '300', expense: '0' },
    ];

    function makeController(ctx, cashflow = CASHFLOW) {
      const controller = ctx.owner.lookup('controller:financials');
      controller.model = { cashflow };
      return controller;
    }

    test('income and expense come through as numbers', function (assert) {
      const controller = makeController(this);

      assert.deepEqual(controller.incomePoints, [
        {
          month: '2026-01',
          from: '2026-01-01',
          to: '2026-01-31',
          value: 1000.5,
        },
        { month: '2026-02', from: '2026-02-01', to: '2026-02-28', value: 0 },
      ]);
      assert.deepEqual(controller.expensePoints, [
        { month: '2026-01', from: '2026-01-01', to: '2026-01-31', value: 400 },
        { month: '2026-02', from: '2026-02-01', to: '2026-02-28', value: 0 },
      ]);
    });

    test('net is income less expense, bucket by bucket', function (assert) {
      const controller = makeController(this);

      assert.deepEqual(controller.netPoints, [
        {
          month: '2026-01',
          from: '2026-01-01',
          to: '2026-01-31',
          value: 600.5,
        },
        { month: '2026-02', from: '2026-02-01', to: '2026-02-28', value: 0 },
      ]);
    });

    test('a day-block series keeps its bounds and has no month', function (assert) {
      const controller = makeController(this, BLOCKS);

      assert.deepEqual(controller.incomePoints, [
        { month: undefined, from: '2026-09-08', to: '2026-09-14', value: 200 },
        { month: undefined, from: '2026-09-15', to: '2026-09-21', value: 300 },
      ]);
    });

    test('bucketNoun follows what the API actually bucketed by', function (assert) {
      assert.strictEqual(makeController(this).bucketNoun, 'month');
      assert.strictEqual(makeController(this, BLOCKS).bucketNoun, 'period');
      assert.strictEqual(makeController(this, []).bucketNoun, 'period');
    });

    test('no cashflow yields empty series rather than failing', function (assert) {
      const controller = this.owner.lookup('controller:financials');
      controller.model = null;

      assert.deepEqual(controller.cashflow, []);
      assert.deepEqual(controller.incomePoints, []);
      assert.deepEqual(controller.netPoints, []);
    });
  });

  module('transaction date rules', function () {
    function makeController(ctx, timezone = 'Asia/Dubai') {
      const controller = ctx.owner.lookup('controller:financials');
      controller.region.activeRegion = { code: 'dxb', timezone };
      return controller;
    }

    test('the picker closes today and opens 30 days back', function (assert) {
      const controller = makeController(this);
      const { earliest, latest } = controller.dateWindow;

      const days = (Date.parse(latest) - Date.parse(earliest)) / 86400000;
      assert.strictEqual(days, 30, 'exactly 30 days of window');
      assert.strictEqual(
        latest,
        new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }),
        'the latest day is today in the active region',
      );
    });

    test('a date is required only once the row is completed', function (assert) {
      const controller = makeController(this);

      controller.formStatus = 'PENDING';
      assert.false(controller.dateRequired);

      controller.formStatus = 'COMPLETED';
      assert.true(controller.dateRequired);
    });

    test('completing with no date is refused before any request', async function (assert) {
      const controller = makeController(this);
      controller.auth = {
        fetchJson() {
          throw new Error('no request expected');
        },
      };
      controller.formStatus = 'COMPLETED';
      controller.formDate = '';

      await controller.saveTx({ preventDefault() {} });

      assert.strictEqual(
        controller.errorMsg,
        'Enter the date the money arrived.',
      );
      assert.false(controller.isSaving);
    });
  });

  test('retryLoad re-runs the financials model hook', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    const refreshed = [];
    controller.router = { refresh: (name) => refreshed.push(name) };

    controller.retryLoad();

    assert.deepEqual(refreshed, ['financials']);
  });

  test('switching tab restarts paging', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.page = 5;

    controller.setTab('EXPENSE');

    assert.strictEqual(controller.activeTab, 'EXPENSE');
    assert.strictEqual(controller.page, 1);
  });

  test('getRowClass mutes cancelled and failed rows only', function (assert) {
    const controller = this.owner.lookup('controller:financials');

    assert.strictEqual(
      controller.getRowClass({ status: 'CANCELLED' }),
      'is-muted',
    );
    assert.strictEqual(
      controller.getRowClass({ status: 'FAILED' }),
      'is-muted',
    );
    assert.strictEqual(controller.getRowClass({ status: 'COMPLETED' }), '');
    assert.strictEqual(controller.getRowClass({ status: 'PENDING' }), '');
    assert.strictEqual(controller.getRowClass(undefined), '');
  });
});
