import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import {
  addCalendarDays,
  localDateString,
  todayInZone,
} from 'land/utils/local-date';
import { MAX_BACKDATE_DAYS } from 'land/constants';
import { formatDate } from 'land/helpers/format-date';

module('Unit | Controller | cheques', function (hooks) {
  setupTest(hooks);

  function makeController(ctx) {
    const controller = ctx.owner.lookup('controller:cheques');
    controller.region.activeRegion = null;
    return controller;
  }

  // Counts calls so a rejected form can be proven to have reached no endpoint.
  function stubFetch(controller) {
    const calls = [];
    controller.auth.fetchJson = (url, options) => {
      calls.push({ url, options });
      return Promise.resolve({ success: true });
    };
    return calls;
  }

  module('clear window', function () {
    test('floors at the backdating limit for an old cheque', function (assert) {
      const controller = makeController(this);
      const today = localDateString();
      controller.clearChequeItem = { dueDate: '2020-01-01', depositDate: null };

      assert.strictEqual(
        controller.clearDateWindow.earliest,
        addCalendarDays(today, -MAX_BACKDATE_DAYS),
      );
      assert.strictEqual(controller.clearDateWindow.latest, today);
    });

    test('floors at the due date when it is later than the backdating limit', function (assert) {
      const controller = makeController(this);
      const dueDate = addCalendarDays(localDateString(), -5);
      controller.clearChequeItem = { dueDate, depositDate: null };

      assert.strictEqual(controller.clearDateWindow.earliest, dueDate);
    });

    test('floors at the deposit date when it is the latest of the three', function (assert) {
      const controller = makeController(this);
      const today = localDateString();
      controller.clearChequeItem = {
        dueDate: addCalendarDays(today, -10),
        depositDate: addCalendarDays(today, -2),
      };

      assert.strictEqual(
        controller.clearDateWindow.earliest,
        addCalendarDays(today, -2),
      );
    });

    // A post-dated cheque has no clearable day: the due-date floor sits past today.
    test('a cheque not yet due has an unusable window', function (assert) {
      const controller = makeController(this);
      const dueDate = addCalendarDays(localDateString(), 20);
      controller.clearChequeItem = { dueDate, depositDate: null };

      assert.true(controller.clearWindowUnusable);
      assert.true(controller.clearBlockedMessage.includes(formatDate(dueDate)));
    });

    test('openClear leaves the date empty when the window is unusable', function (assert) {
      const controller = makeController(this);
      controller.openClear({
        id: 'c1',
        dueDate: addCalendarDays(localDateString(), 20),
      });

      assert.strictEqual(controller.clearedDate, '');
      assert.true(controller.clearWindowUnusable);
    });

    // 21:00 UTC on the 23rd is already the 24th in Dubai, which is the server's floor.
    test('the added date is the day in the cheque region, not the UTC day', function (assert) {
      const controller = makeController(this);
      controller.region.regions = [{ code: 'dubai', timezone: 'Asia/Dubai' }];
      controller.clearChequeItem = {
        regionCode: 'dubai',
        createdAt: '2026-09-23T21:00:00.000Z',
      };

      assert.strictEqual(controller.chequeAddedDate, '2026-09-24');
      assert.strictEqual(controller.depositDateWindow.earliest, '2026-09-24');
    });

    // The backend validates against the CHEQUE's region, not the one being viewed.
    test('the window follows the cheque region, not the active region', function (assert) {
      const controller = this.owner.lookup('controller:cheques');
      controller.region.regions = [
        { code: 'ahead', timezone: 'Pacific/Kiritimati' },
        { code: 'behind', timezone: 'Pacific/Pago_Pago' },
      ];
      controller.region.activeRegion = {
        code: 'behind',
        timezone: 'Pacific/Pago_Pago',
      };
      controller.clearChequeItem = {
        regionCode: 'ahead',
        dueDate: '2020-01-01',
        depositDate: null,
      };

      assert.strictEqual(
        controller.clearDateWindow.latest,
        todayInZone('Pacific/Kiritimati'),
      );
      assert.notStrictEqual(
        todayInZone('Pacific/Kiritimati'),
        todayInZone('Pacific/Pago_Pago'),
      );
    });

    test('openClear defaults the date to today', function (assert) {
      const controller = makeController(this);
      const before = localDateString();
      controller.openClear({ id: 'c1', dueDate: '2026-01-01' });
      const after = localDateString();

      assert.true([before, after].includes(controller.clearedDate));
      assert.true(controller.showClearModal);
    });
  });

  module('deposit date', function () {
    test('is read-only when the cheque already has one', function (assert) {
      const controller = makeController(this);
      controller.openClear({
        id: 'c1',
        dueDate: '2020-01-01',
        depositDate: '2026-08-10',
      });

      assert.false(controller.depositDateEditable);
      assert.true(controller.depositDateReadonly);
      assert.strictEqual(controller.clearDepositDate, '2026-08-10');
    });

    test('is editable and empty when clearing straight from PENDING', function (assert) {
      const controller = makeController(this);
      controller.openClear({ id: 'c1', dueDate: '2020-01-01' });

      assert.true(controller.depositDateEditable);
      assert.strictEqual(controller.clearDepositDate, '');
    });

    // Moving the clearing day back drags the deposit with it.
    test('is pulled back when the clearing date moves before it', function (assert) {
      const controller = makeController(this);
      controller.openClear({ id: 'c1', dueDate: '2020-01-01' });
      controller.clearDepositDate = '2026-08-05';

      controller.setClearedDate('2026-08-02');

      assert.strictEqual(controller.clearDepositDate, '2026-08-02');
    });

    // And the correction sticks: moving the clearing day forward does not restore it.
    test('stays where it was pulled to when the clearing date moves forward again', function (assert) {
      const controller = makeController(this);
      controller.openClear({ id: 'c1', dueDate: '2020-01-01' });
      controller.clearDepositDate = '2026-08-05';
      controller.setClearedDate('2026-08-02');

      controller.setClearedDate('2026-08-05');

      assert.strictEqual(controller.clearDepositDate, '2026-08-02');
    });

    test('a settled deposit date is never pulled', function (assert) {
      const controller = makeController(this);
      controller.openClear({
        id: 'c1',
        dueDate: '2020-01-01',
        depositDate: '2026-08-10',
      });

      controller.setClearedDate('2026-08-02');

      assert.strictEqual(controller.clearDepositDate, '2026-08-10');
    });
  });

  module('confirmClear', function () {
    test('refuses an empty date and calls no endpoint', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.openClear({ id: 'c1', dueDate: '2026-01-01' });
      controller.clearedDate = '';

      await controller.confirmClear();

      assert.strictEqual(calls.length, 0);
      assert.ok(controller.clearError);
    });

    test('refuses a date past the window and calls no endpoint', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.openClear({ id: 'c1', dueDate: '2026-01-01' });
      controller.clearedDate = addCalendarDays(localDateString(), 1);

      await controller.confirmClear();

      assert.strictEqual(calls.length, 0);
      assert.ok(controller.clearError);
    });

    test('refuses an unusable window and calls no endpoint', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.openClear({
        id: 'c1',
        dueDate: addCalendarDays(localDateString(), 20),
      });

      await controller.confirmClear();

      assert.strictEqual(calls.length, 0);
      // Pinned to the literal, not to the getter that produced it: comparing the
      // two holds for either arm and for any text the getter ever returns.
      assert.strictEqual(
        controller.clearError,
        `This cheque is not due until ${formatDate(addCalendarDays(localDateString(), 20))}, so it cannot be cleared yet.`,
      );
    });

    test('names the other blocked reason when the due date is not what blocks it', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      // Due long ago, but deposited in the future: the window is unusable and
      // the due-date arm cannot explain it, so the fallback must.
      controller.openClear({
        id: 'c1',
        dueDate: '2020-01-01',
        depositDate: addCalendarDays(localDateString(), 5),
      });

      await controller.confirmClear();

      assert.strictEqual(calls.length, 0);
      assert.strictEqual(
        controller.clearError,
        'This cheque has no date that can be recorded as its clearing day.',
      );
    });

    test('posts the cleared date to the clear endpoint', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.router.refresh = () => {};
      controller.openClear({ id: 'c1', dueDate: '2026-01-01' });
      const date = controller.clearedDate;

      await controller.confirmClear();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, '/cheques/c1/clear');
      assert.strictEqual(calls[0].options.method, 'POST');
      assert.deepEqual(JSON.parse(calls[0].options.body), {
        clearedDate: date,
      });
    });
  });

  module('confirmClear with a deposit date', function () {
    const cheque = {
      id: 'c1',
      dueDate: '2020-01-01',
      createdAt: '2026-08-01T06:00:00Z',
    };

    test('sends the deposit date when one was typed', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.router.refresh = () => {};
      controller.openClear(cheque);
      controller.clearDepositDate = '2026-08-05';
      // A successful clear closes the dialog, which resets clearedDate.
      const date = controller.clearedDate;

      await controller.confirmClear();

      assert.strictEqual(calls.length, 1);
      assert.deepEqual(JSON.parse(calls[0].options.body), {
        clearedDate: date,
        depositDate: '2026-08-05',
      });
    });

    test('omits the deposit date when it was left empty', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.router.refresh = () => {};
      controller.openClear(cheque);
      const date = controller.clearedDate;

      await controller.confirmClear();

      assert.deepEqual(JSON.parse(calls[0].options.body), {
        clearedDate: date,
      });
    });

    test('refuses a deposit date after the clearing date', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.openClear(cheque);
      // Both inside the clear window, so the range check passes and the
      // deposit-after-clearing branch is the one that fires.
      const { earliest, latest } = controller.clearDateWindow;
      controller.clearedDate = earliest;
      controller.clearDepositDate = latest;

      await controller.confirmClear();

      assert.strictEqual(
        controller.clearError,
        'The deposit date cannot be after the clearing date.',
      );
      assert.strictEqual(calls.length, 0);
    });

    test('surfaces the server message and releases the in-flight flag', async function (assert) {
      const controller = makeController(this);
      controller.auth.fetchJson = () =>
        Promise.reject(new Error('Cheque is already cleared'));
      controller.openClear(cheque);

      await controller.confirmClear();

      assert.strictEqual(controller.clearError, 'Cheque is already cleared');
      assert.false(controller.isClearing);
    });

    test('falls back to a generic message when the error carries none', async function (assert) {
      const controller = makeController(this);
      controller.auth.fetchJson = () => Promise.reject(new Error(''));
      controller.openClear(cheque);

      await controller.confirmClear();

      assert.strictEqual(controller.clearError, 'Failed to clear cheque');
      assert.false(controller.isClearing);
    });

    test('a second confirm while one is in flight sends nothing', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.router.refresh = () => {};
      controller.openClear(cheque);
      controller.isClearing = true;

      await controller.confirmClear();

      assert.strictEqual(calls.length, 0);
    });

    test('does nothing when no cheque is open', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);

      await controller.confirmClear();

      assert.strictEqual(calls.length, 0);
      assert.strictEqual(controller.clearError, '');
    });

    test('refuses a date BEFORE the window opens, not only after it closes', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.openClear(cheque);
      const { earliest, latest } = controller.clearDateWindow;
      // A date before earliest takes the `< earliest` arm of the same ||.
      controller.clearedDate = '2019-12-31';

      await controller.confirmClear();

      assert.strictEqual(
        controller.clearError,
        `Pick a date between ${formatDate(earliest)} and ${formatDate(latest)}.`,
      );
      assert.strictEqual(calls.length, 0);
    });

    test('never re-posts a deposit date that is already settled', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.router.refresh = () => {};
      // A DEPOSITED cheque: the field is read-only and must stay out of the body.
      controller.openClear({ ...cheque, depositDate: '2026-08-05' });
      assert.false(controller.depositDateEditable, 'field is read-only');
      assert.strictEqual(
        controller.clearDepositDate,
        '2026-08-05',
        'still shown',
      );

      await controller.confirmClear();

      assert.deepEqual(Object.keys(JSON.parse(calls[0].options.body)), [
        'clearedDate',
      ]);
    });

    test('refuses a deposit date before the cheque was added', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.openClear(cheque);
      controller.clearDepositDate = '2026-07-31';

      await controller.confirmClear();

      assert.strictEqual(calls.length, 0);
      assert.true(controller.clearError.includes(formatDate('2026-08-01')));
    });
  });

  module('confirmUnclear', function () {
    test('refuses an empty reason and calls no endpoint', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.openUnclear({ id: 'c1' });
      controller.unclearReason = '   ';

      await controller.confirmUnclear();

      assert.strictEqual(calls.length, 0);
      assert.strictEqual(controller.reasonError, 'Reason is required.');
    });

    test('closing the dialog clears the reason error it set', async function (assert) {
      const controller = makeController(this);
      stubFetch(controller);
      controller.openUnclear({ id: 'c1' });
      controller.unclearReason = '';
      await controller.confirmUnclear();
      assert.strictEqual(controller.reasonError, 'Reason is required.');

      controller.closeUnclearModal();

      assert.strictEqual(controller.reasonError, '');
    });

    test('closing the cancel dialog clears the reason error too', async function (assert) {
      const controller = makeController(this);
      stubFetch(controller);
      controller.openCancel({ id: 'c1' });
      controller.cancelReason = '';
      await controller.confirmCancel();
      assert.strictEqual(controller.reasonError, 'Reason is required.');

      controller.closeCancelModal();

      assert.strictEqual(controller.reasonError, '');
    });

    test('posts the trimmed reason to the unclear endpoint', async function (assert) {
      const controller = makeController(this);
      const calls = stubFetch(controller);
      controller.router.refresh = () => {};
      controller.openUnclear({ id: 'c1' });
      controller.unclearReason = '  Bank reversed the credit  ';

      await controller.confirmUnclear();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, '/cheques/c1/unclear');
      assert.deepEqual(JSON.parse(calls[0].options.body), {
        reason: 'Bank reversed the credit',
      });
    });
  });
});
