import { module, test } from 'qunit';
import { setupTest } from 'land/tests/helpers';
import { localDateString, todayInZone } from 'land/utils/local-date';

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
    // UTC+14 and UTC-11 are always on different dates, so one differs from the browser date.
    const zone = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'].find(
      (tz) => todayInZone(tz) !== localDateString(),
    );
    controller.region.activeRegion = { code: 'far', timezone: zone };
    assertToday(assert, controller, () => todayInZone(zone));
    assert.notStrictEqual(controller.formDate, localDateString());
  });

  test('openCreate falls back to the browser-local date without an active region', function (assert) {
    const controller = this.owner.lookup('controller:financials');
    controller.region.activeRegion = null;
    assertToday(assert, controller, () => localDateString());
  });
});
