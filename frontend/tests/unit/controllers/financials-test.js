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

    test('bucketNoun follows what the API actually bucketed by', function (assert) {
      assert.strictEqual(makeController(this).bucketNoun, 'month');
      assert.strictEqual(makeController(this, BLOCKS).bucketNoun, 'period');
      assert.strictEqual(makeController(this, []).bucketNoun, 'period');
    });

    test('no cashflow yields an empty series rather than failing', function (assert) {
      const controller = this.owner.lookup('controller:financials');
      controller.model = null;

      assert.deepEqual(controller.cashflow, []);
      assert.false(controller.cashflowFailed, 'not loaded is not failed');
    });

    test('a failed cashflow load is reported, not shown as empty', function (assert) {
      const controller = makeController(this, null);

      assert.deepEqual(controller.cashflow, []);
      assert.true(controller.cashflowFailed);
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

  test('a cheque payment forces the type to expense and locks it', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.openCreate();

    controller.setPaymentMethod('CHEQUE');

    assert.strictEqual(controller.formType, 'EXPENSE');
    assert.true(controller.typeLocked);
  });

  test('rental income and sale categories force income and lock it', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.openCreate();

    controller.setCategory('RENT');
    assert.strictEqual(controller.formType, 'INCOME');
    assert.true(controller.typeLocked);

    controller.setCategory('SALE');
    assert.strictEqual(controller.formType, 'INCOME');
    assert.true(controller.typeLocked);
  });

  test('payment method outranks category: rent paid by cheque is an expense', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.openCreate();

    controller.setCategory('RENT');
    controller.setPaymentMethod('CHEQUE');

    assert.strictEqual(controller.formType, 'EXPENSE');
    assert.true(controller.typeLocked);
  });

  test('two-way categories leave the type editable', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.openCreate();

    for (const category of ['DEPOSIT', 'MAINTENANCE', 'COMMISSION', 'OTHER']) {
      controller.setCategory(category);
      assert.false(controller.typeLocked, `${category} leaves type unlocked`);
    }

    controller.formType = 'EXPENSE';
    assert.strictEqual(controller.formType, 'EXPENSE');
  });

  test('the date label follows the direction of the money', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.openCreate();

    controller.setCategory('RENT');
    assert.strictEqual(controller.dateLabel, 'Date money arrived');

    controller.setPaymentMethod('CHEQUE');
    assert.strictEqual(controller.dateLabel, 'Date money was paid');
  });

  test('a cheque payment hides the incoming-only categories', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.openCreate();

    const all = controller.categoryOptions.map((o) => o.value);
    assert.true(all.includes('RENT'), 'rent is offered by default');
    assert.true(all.includes('SALE'), 'sale is offered by default');

    controller.setPaymentMethod('CHEQUE');

    const offered = controller.categoryOptions.map((o) => o.value);
    assert.deepEqual(offered, [
      'DEPOSIT',
      'MAINTENANCE',
      'COMMISSION',
      'OTHER',
    ]);
  });

  test('switching to cheque clears a category it no longer offers', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.openCreate();

    controller.setCategory('RENT');
    controller.setPaymentMethod('CHEQUE');
    assert.strictEqual(controller.formCategory, '', 're-pick is forced');

    controller.setCategory('MAINTENANCE');
    controller.setPaymentMethod('CASH');
    assert.strictEqual(
      controller.formCategory,
      'MAINTENANCE',
      'a still-valid category survives the switch',
    );
  });

  test('unlocking gives back the type the user had chosen', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.openCreate();
    assert.strictEqual(controller.formType, 'INCOME', 'starts on income');

    controller.setPaymentMethod('CHEQUE');
    assert.strictEqual(controller.formType, 'EXPENSE');
    assert.true(controller.typeLocked);

    controller.setPaymentMethod('CASH');
    assert.false(controller.typeLocked, 'the control unlocks');
    assert.strictEqual(
      controller.formType,
      'INCOME',
      'and the old choice returns',
    );
  });

  test('a second lock does not overwrite the remembered choice', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.openCreate();
    controller.formType = 'EXPENSE';

    controller.setCategory('RENT');
    assert.strictEqual(controller.formType, 'INCOME', 'rent pins income');

    controller.setPaymentMethod('CHEQUE');
    assert.strictEqual(controller.formType, 'EXPENSE', 'cheque outranks it');

    controller.setPaymentMethod('CASH');
    controller.setCategory('OTHER');
    assert.false(controller.typeLocked);
    assert.strictEqual(
      controller.formType,
      'EXPENSE',
      'the original choice survives',
    );
  });

  module('work queue', function () {
    const TODAY = '2026-10-10';

    function cheque(id, dueDate, amount, regionCode = 'dxb') {
      return {
        id,
        chequeNumber: `00${id}`,
        bankName: 'Test Bank',
        accountHolder: 'Test Holder',
        dueDate,
        amount: String(amount),
        regionCode,
      };
    }

    function payment(id, dueDate, amount) {
      return {
        id,
        description: `Payment ${id}`,
        category: 'RENT',
        dueDate,
        amount: String(amount),
      };
    }

    function makeController(ctx, model = {}) {
      const controller = ctx.owner.lookup('controller:financials');
      controller.region.activeRegion = {
        code: 'dxb',
        timezone: 'Asia/Dubai',
      };
      controller.model = {
        chequeSchedule: { overdue: [], thisWeek: [] },
        depositReminders: { overdue: [], dueToday: [], dueThisWeek: [] },
        ...model,
      };
      return controller;
    }

    test('overdue rows come before this week, each group by due date', function (assert) {
      const controller = makeController(this, {
        chequeSchedule: {
          overdue: [cheque('c1', '2026-10-05', 100)],
          thisWeek: [cheque('c2', '2026-10-12', 200)],
        },
        depositReminders: {
          overdue: [payment('p1', '2026-09-28', 300)],
          dueToday: [payment('p2', '2026-10-10', 400)],
          dueThisWeek: [payment('p3', '2026-10-11', 500)],
        },
      });

      const { rows } = controller.queueFor(TODAY);

      assert.deepEqual(
        rows.map((row) => row.key),
        ['payment-p1', 'cheque-c1', 'payment-p2', 'payment-p3', 'cheque-c2'],
      );
    });

    test('an overdue row stays above a this-week row with an earlier date', function (assert) {
      const controller = makeController(this, {
        chequeSchedule: {
          overdue: [cheque('c1', '2026-10-09', 100)],
          thisWeek: [],
        },
        depositReminders: {
          overdue: [],
          dueToday: [],
          dueThisWeek: [payment('p1', '2026-10-11', 100)],
        },
      });

      const { rows } = controller.queueFor(TODAY);

      assert.deepEqual(
        rows.map((row) => row.key),
        ['cheque-c1', 'payment-p1'],
      );
    });

    test('rows carry the computed due word and relative label', function (assert) {
      const controller = makeController(this, {
        chequeSchedule: {
          overdue: [cheque('c1', '2026-09-28', 100)],
          thisWeek: [cheque('c2', '2026-10-13', 100)],
        },
      });

      const [late, soon] = controller.queueFor(TODAY).rows;

      assert.strictEqual(late.dueWord, 'Overdue');
      assert.strictEqual(late.dueLabel, '12 days overdue');
      assert.true(late.isOverdue);
      assert.strictEqual(soon.dueWord, 'Upcoming');
      assert.strictEqual(soon.dueLabel, 'due in 3 days');
      assert.false(soon.isOverdue);
    });

    test('a timestamp due date is read as its calendar day', function (assert) {
      const controller = makeController(this, {
        chequeSchedule: {
          overdue: [cheque('c1', '2026-10-07T00:00:00.000Z', 100)],
          thisWeek: [],
        },
      });

      const [row] = controller.queueFor(TODAY).rows;

      assert.strictEqual(row.dueDate, '2026-10-07');
      assert.strictEqual(row.dueLabel, '3 days overdue');
    });

    test('at most eight rows show and the rest are counted', function (assert) {
      const overdue = Array.from({ length: 11 }, (_, i) =>
        cheque(`c${i}`, `2026-09-${String(10 + i).padStart(2, '0')}`, 10),
      );
      const controller = makeController(this, {
        chequeSchedule: { overdue, thisWeek: [] },
      });

      const queue = controller.queueFor(TODAY);

      assert.strictEqual(queue.rows.length, 8);
      assert.strictEqual(queue.hiddenCount, 3);
      assert.strictEqual(queue.count, 11);
      assert.strictEqual(queue.rows[0].key, 'cheque-c0', 'oldest first');
    });

    test('a short queue hides nothing', function (assert) {
      const controller = makeController(this, {
        chequeSchedule: {
          overdue: [cheque('c1', '2026-10-01', 10)],
          thisWeek: [],
        },
      });

      assert.strictEqual(controller.queueFor(TODAY).hiddenCount, 0);
    });

    test('the overdue total sums overdue rows only', function (assert) {
      const controller = makeController(this, {
        chequeSchedule: {
          overdue: [cheque('c1', '2026-10-01', 100.5)],
          thisWeek: [cheque('c2', '2026-10-12', 999)],
        },
        depositReminders: {
          overdue: [payment('p1', '2026-10-02', 200)],
          dueToday: [],
          dueThisWeek: [],
        },
      });

      const queue = controller.queueFor(TODAY);

      assert.strictEqual(queue.overdueTotal, 300.5);
      assert.strictEqual(queue.overdueCount, 2);
    });

    test('a failed source is flagged, an empty one is not', function (assert) {
      const controller = makeController(this);
      assert.false(controller.queueFailed, 'both loaded and empty');
      assert.strictEqual(controller.queueFor(TODAY).count, 0);

      controller.model = { ...controller.model, chequeSchedule: null };
      assert.true(controller.queueFailed, 'the schedule failed');

      controller.model = {
        chequeSchedule: { overdue: [], thisWeek: [] },
        depositReminders: null,
      };
      assert.true(controller.queueFailed, 'the reminders failed');
    });

    test('queue amounts never reach the period totals', function (assert) {
      const controller = makeController(this, {
        summary: { totalIncome: 1000, totalExpense: 400, net: 600 },
        chequeSchedule: {
          overdue: [cheque('c1', '2026-10-01', 5000)],
          thisWeek: [cheque('c2', '2026-10-12', 7000)],
        },
        depositReminders: {
          overdue: [payment('p1', '2026-10-02', 3000)],
          dueToday: [],
          dueThisWeek: [],
        },
      });

      assert.strictEqual(controller.queueFor(TODAY).count, 3);
      assert.deepEqual(controller.totals, {
        income: 1000,
        expense: 400,
        net: 600,
      });
    });

    test('no summary means no totals', function (assert) {
      const controller = makeController(this, { summary: null });

      assert.strictEqual(controller.totals, null);
    });
  });

  module('spending by category', function () {
    function makeController(ctx, categories) {
      const controller = ctx.owner.lookup('controller:financials');
      controller.model = { categories };
      return controller;
    }

    test('expenses only, largest first, with their share', function (assert) {
      const controller = makeController(this, [
        { category: 'RENT', type: 'INCOME', total: 9000 },
        { category: 'OTHER', type: 'EXPENSE', total: 250 },
        { category: 'MAINTENANCE', type: 'EXPENSE', total: 750 },
      ]);

      assert.deepEqual(
        controller.expenseCategories.map((row) => [
          row.category,
          row.total,
          row.share,
        ]),
        [
          ['MAINTENANCE', 750, 75],
          ['OTHER', 250, 25],
        ],
      );
    });

    test('a failed load is reported, not shown as empty', function (assert) {
      const controller = makeController(this, null);

      assert.true(controller.categoriesFailed);
      assert.deepEqual(controller.expenseCategories, []);
    });
  });
});
