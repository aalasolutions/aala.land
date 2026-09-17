import { module, test } from 'qunit';
import {
  browserTimeZone,
  daysUntil,
  formatCalendarDate,
  formatInstant,
  isDateOnly,
  localDateString,
  localEndOfDayIso,
  localMidnightIso,
  timeAgo,
  toDateOnly,
  toEpochMs,
  todayInZone,
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

  test('formatInstant renders browser time or a given zone', function (assert) {
    const options = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    assert.strictEqual(
      formatInstant('2026-09-16T20:00:00Z', 'en-US', options, 'Asia/Dubai'),
      '00:00',
    );
    assert.strictEqual(
      formatInstant('2026-09-16T20:00:00Z', 'en-US', options),
      new Date('2026-09-16T20:00:00Z')
        .toLocaleString('en-US', options)
        .replace(/\s/g, ' '),
    );
    assert.strictEqual(formatInstant('bad', 'en-US'), null);
    assert.strictEqual(
      formatInstant('2026-09-16T20:00:00Z', 'en-US', options, 'Not/AZone'),
      null,
    );
  });

  test('browserTimeZone matches Intl', function (assert) {
    assert.strictEqual(
      browserTimeZone(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });
  test('formatCalendarDate and formatInstant default to the browser locale', function (assert) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    assert.strictEqual(
      formatInstant('2026-09-16T20:00:00Z', undefined, options),
      new Date('2026-09-16T20:00:00Z')
        .toLocaleDateString(undefined, options)
        .replace(/\s/g, ' '),
    );
    assert.strictEqual(
      formatCalendarDate('2026-09-16'),
      new Date('2026-09-16').toLocaleDateString(undefined, { timeZone: 'UTC' }),
    );
    const instant = '2026-09-16T20:00:00Z';
    assert.strictEqual(
      formatCalendarDate(instant),
      new Date(instant).toLocaleDateString(undefined),
    );
  });

  test('localEndOfDayIso returns 23:59:59.000 local time', function (assert) {
    assert.strictEqual(
      localEndOfDayIso('2026-09-16'),
      new Date('2026-09-16T23:59:59').toISOString(),
    );
    assert.strictEqual(
      localEndOfDayIso('2026-09-16'),
      new Date(2026, 8, 16, 23, 59, 59, 0).toISOString(),
    );
    assert.strictEqual(localEndOfDayIso(''), null);
    assert.strictEqual(localEndOfDayIso(null), null);
    assert.strictEqual(localEndOfDayIso('garbage'), null);
    assert.strictEqual(localEndOfDayIso('2026-02-31'), null);
  });

  test('toDateOnly keeps the written date part', function (assert) {
    assert.strictEqual(toDateOnly('2026-09-16'), '2026-09-16');
    assert.strictEqual(toDateOnly('2026-09-16T23:30:00.000Z'), '2026-09-16');
    assert.strictEqual(toDateOnly('2026-09-16T01:00:00+04:00'), '2026-09-16');
    assert.strictEqual(
      toDateOnly(new Date('2026-09-16T23:30:00.000Z')),
      '2026-09-16',
    );
    assert.strictEqual(toDateOnly(''), '');
    assert.strictEqual(toDateOnly(null), '');
    assert.strictEqual(toDateOnly(undefined), '');
    assert.strictEqual(toDateOnly(new Date('bad')), '');
    assert.strictEqual(toDateOnly('garbage'), '');
    assert.strictEqual(toDateOnly('2026-09-16 10:00:00'), '');
  });

  test('toEpochMs matches Date parsing', function (assert) {
    assert.strictEqual(toEpochMs('2026-09-16'), Date.UTC(2026, 8, 16));
    assert.strictEqual(
      toEpochMs('2026-09-16T10:00:00Z'),
      Date.UTC(2026, 8, 16, 10),
    );
    assert.strictEqual(toEpochMs(new Date(5)), 5);
    assert.true(Number.isNaN(toEpochMs('bad')));
    assert.true(Number.isNaN(toEpochMs(undefined)));
    const sorted = ['2026-09-16T10:00:00Z', '2026-09-16', '2026-09-17']
      .slice()
      .sort((a, b) => toEpochMs(b) - toEpochMs(a));
    assert.deepEqual(sorted, [
      '2026-09-17',
      '2026-09-16T10:00:00Z',
      '2026-09-16',
    ]);
  });

  test('daysUntil rounds partial days up', function (assert) {
    const now = Date.UTC(2026, 8, 16, 12);
    assert.strictEqual(daysUntil('2026-09-16T12:00:00Z', now), 0);
    assert.strictEqual(daysUntil('2026-09-16T12:00:01Z', now), 1);
    assert.strictEqual(daysUntil('2026-09-18T12:00:00Z', now), 2);
    assert.strictEqual(daysUntil('2026-09-18T13:00:00Z', now), 3);
    assert.strictEqual(daysUntil('2026-09-15T00:00:00Z', now), -1);
    assert.strictEqual(daysUntil(null, now), null);
    assert.strictEqual(daysUntil('bad', now), null);
  });

  test('timeAgo returns short relative strings', function (assert) {
    const now = Date.UTC(2026, 8, 16, 12);
    const ago = (ms) => new Date(now - ms).toISOString();
    assert.strictEqual(timeAgo(ago(30 * 1000), now), 'just now');
    assert.strictEqual(timeAgo(ago(-5 * 60000), now), 'just now');
    assert.strictEqual(timeAgo(ago(60000), now), '1m ago');
    assert.strictEqual(timeAgo(ago(59 * 60000), now), '59m ago');
    assert.strictEqual(timeAgo(ago(60 * 60000), now), '1h ago');
    assert.strictEqual(timeAgo(ago(23 * 3600000 + 59 * 60000), now), '23h ago');
    assert.strictEqual(timeAgo(ago(24 * 3600000), now), '1d ago');
    assert.strictEqual(timeAgo(ago(49 * 3600000), now), '2d ago');
    assert.strictEqual(timeAgo('', now), '');
    assert.strictEqual(timeAgo(null, now), '');
    assert.strictEqual(timeAgo('bad', now), '');
  });

  test('todayInZone reads the calendar day in a zone', function (assert) {
    const at = new Date('2026-09-16T21:30:00Z');
    assert.strictEqual(todayInZone('Asia/Dubai', at), '2026-09-17');
    assert.strictEqual(todayInZone('America/Los_Angeles', at), '2026-09-16');
    assert.strictEqual(todayInZone(null, at), localDateString(at));
    assert.strictEqual(todayInZone('Not/AZone', at), localDateString(at));
    assert.strictEqual(todayInZone('Asia/Dubai', new Date('bad')), null);
  });
});
