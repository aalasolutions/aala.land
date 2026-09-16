import { module, test } from 'qunit';
import {
  formatCalendarDate,
  isDateOnly,
  localDateString,
  localMidnightIso,
} from 'land/utils/local-date';

module('Unit | Utility | local-date', function () {
  test('isDateOnly matches only YYYY-MM-DD strings', function (assert) {
    assert.true(isDateOnly('2026-09-16'));
    assert.false(isDateOnly('2026-09-16T00:00:00Z'));
    assert.false(isDateOnly(null));
    assert.false(isDateOnly('2026-02-31'));
    assert.false(isDateOnly('2026-13-01'));
    assert.true(isDateOnly('2028-02-29'));
  });

  test('localDateString uses the browser-local calendar date', function (assert) {
    assert.strictEqual(
      localDateString(new Date(2026, 0, 5, 23, 59)),
      '2026-01-05',
    );
    assert.strictEqual(
      localDateString(new Date(2026, 8, 16, 0, 1)),
      '2026-09-16',
    );
  });

  test('localMidnightIso returns local midnight and rolls over months', function (assert) {
    assert.strictEqual(
      localMidnightIso('2026-09-16'),
      new Date(2026, 8, 16).toISOString(),
    );
    assert.strictEqual(
      localMidnightIso('2026-09-30', 1),
      new Date(2026, 9, 1).toISOString(),
    );
    assert.strictEqual(localMidnightIso(''), null);
    assert.strictEqual(localMidnightIso('garbage'), null);
    assert.strictEqual(localMidnightIso('2026-02-31'), null);
    assert.strictEqual(localMidnightIso('2026-02-31', 1), null);
  });

  test('formatCalendarDate does not shift a date-only value', function (assert) {
    assert.strictEqual(
      formatCalendarDate('2026-09-16', 'en-US', {
        month: 'short',
        day: 'numeric',
      }),
      'Sep 16',
    );
    assert.strictEqual(formatCalendarDate('bad', 'en-US'), null);
    assert.strictEqual(formatCalendarDate('2026-02-31', 'en-US'), null);
  });
});
