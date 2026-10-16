import { module, test } from 'qunit';
import {
  DEFAULT_RANGE,
  RANGES,
  browserTimeZone,
  daysUntil,
  formatCalendarDate,
  formatCalendarRange,
  formatDualZoneDateTime,
  formatInstant,
  formatShortDate,
  formatShortDateTime,
  formatShortTime,
  isDateOnly,
  isKnownRange,
  localDateString,
  localEndOfDayIso,
  localMidnightIso,
  rangeBounds,
  resolveRange,
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

  test('localMidnightIso returns midnight in the given zone', function (assert) {
    assert.strictEqual(
      localMidnightIso('2026-09-16', 0, 'Pacific/Kiritimati'),
      '2026-09-15T10:00:00.000Z',
    );
    assert.strictEqual(
      localMidnightIso('2026-09-16', 0, 'Pacific/Pago_Pago'),
      '2026-09-16T11:00:00.000Z',
    );
    assert.strictEqual(
      localMidnightIso('2026-09-30', 1, 'Pacific/Kiritimati'),
      '2026-09-30T10:00:00.000Z',
    );
    assert.strictEqual(
      localMidnightIso('2026-09-16', 0, 'Not/AZone'),
      localMidnightIso('2026-09-16'),
      'an invalid zone falls back to browser-local',
    );
    assert.strictEqual(localMidnightIso('2026-02-31', 0, 'Asia/Dubai'), null);
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

  test('localEndOfDayIso returns 23:59:59.000 in the given zone', function (assert) {
    assert.strictEqual(
      localEndOfDayIso('2026-09-16', 'Pacific/Kiritimati'),
      '2026-09-16T09:59:59.000Z',
    );
    assert.strictEqual(
      localEndOfDayIso('2026-09-16', 'Pacific/Pago_Pago'),
      '2026-09-17T10:59:59.000Z',
    );
    assert.strictEqual(
      localEndOfDayIso('2026-09-16', null),
      localEndOfDayIso('2026-09-16'),
    );
    assert.strictEqual(localEndOfDayIso('', 'Asia/Dubai'), null);
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

  test('daysUntil counts whole calendar days between two dates', function (assert) {
    assert.strictEqual(daysUntil('2026-09-16', '2026-09-16'), 0);
    assert.strictEqual(daysUntil('2026-09-18', '2026-09-16'), 2);
    assert.strictEqual(daysUntil('2026-09-15', '2026-09-16'), -1);
    assert.strictEqual(daysUntil('2026-11-01', '2026-10-31'), 1);
    assert.strictEqual(daysUntil('2027-01-01', '2026-12-31'), 1);
    assert.strictEqual(daysUntil('2026-09-18', '2026-09-16T23:00:00Z'), null);
    assert.strictEqual(daysUntil('2026-09-18T01:00:00Z', '2026-09-16'), null);
    assert.strictEqual(daysUntil(null, '2026-09-16'), null);
    assert.strictEqual(daysUntil('bad', '2026-09-16'), null);
    assert.strictEqual(daysUntil('2026-09-16', null), null);
    assert.strictEqual(daysUntil('2026-02-31', '2026-02-01'), null);
  });

  test('daysUntil uses the region day late at night in UTC+4', function (assert) {
    const at = new Date('2026-09-16T21:30:00Z');
    const today = todayInZone('Asia/Dubai', at);
    assert.strictEqual(daysUntil('2026-09-17', today), 0);
    assert.strictEqual(daysUntil('2026-09-18', today), 1);
    assert.strictEqual(daysUntil('2026-09-16', today), -1);
  });

  test('daysUntil uses the region day in a negative-offset zone', function (assert) {
    const at = new Date('2026-09-17T02:00:00Z');
    const today = todayInZone('America/Los_Angeles', at);
    assert.strictEqual(today, '2026-09-16');
    assert.strictEqual(daysUntil('2026-09-17', today), 1);
    assert.strictEqual(daysUntil('2026-09-16', today), 0);
  });

  test('daysUntil follows a region switch at the same instant', function (assert) {
    const at = new Date('2026-09-16T21:30:00Z');
    assert.strictEqual(
      daysUntil('2026-09-20', todayInZone('Asia/Dubai', at)),
      3,
    );
    assert.strictEqual(
      daysUntil('2026-09-20', todayInZone('America/Los_Angeles', at)),
      4,
    );
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

  // 20:30 UTC is already the 1st in Dubai and still the 31st in Los Angeles.
  const ACROSS_MONTH_END = new Date('2026-08-31T20:30:00Z');

  test('rangeBounds pivots the day and the month on the given zone', function (assert) {
    assert.deepEqual(rangeBounds('thisMonth', ACROSS_MONTH_END, 'Asia/Dubai'), {
      from: '2026-09-01',
      to: '2026-09-30',
    });
    assert.deepEqual(
      rangeBounds('thisMonth', ACROSS_MONTH_END, 'America/Los_Angeles'),
      { from: '2026-08-01', to: '2026-08-31' },
    );
    assert.deepEqual(rangeBounds('lastMonth', ACROSS_MONTH_END, 'Asia/Dubai'), {
      from: '2026-08-01',
      to: '2026-08-31',
    });
    assert.deepEqual(rangeBounds('last7', ACROSS_MONTH_END, 'Asia/Dubai'), {
      from: '2026-08-26',
      to: '2026-09-01',
    });
    assert.deepEqual(rangeBounds('last30', ACROSS_MONTH_END, 'Asia/Dubai'), {
      from: '2026-08-03',
      to: '2026-09-01',
    });
  });

  test('rangeBounds falls back to browser time without a usable zone', function (assert) {
    const local = rangeBounds('last7', ACROSS_MONTH_END);
    assert.strictEqual(local.to, localDateString(ACROSS_MONTH_END));
    assert.deepEqual(
      rangeBounds('last7', ACROSS_MONTH_END, 'Not/AZone'),
      local,
    );
    assert.strictEqual(
      rangeBounds('thisMonth', ACROSS_MONTH_END).from,
      `${localDateString(ACROSS_MONTH_END).slice(0, 7)}-01`,
    );
  });

  test('rangeBounds returns null instead of guessing a period', function (assert) {
    assert.strictEqual(rangeBounds('garbage', ACROSS_MONTH_END), null);
    assert.strictEqual(rangeBounds('', ACROSS_MONTH_END), null);
    assert.strictEqual(rangeBounds(undefined, ACROSS_MONTH_END), null);
    assert.strictEqual(rangeBounds('custom', ACROSS_MONTH_END), null);
    assert.strictEqual(rangeBounds('thisMonth', new Date('bad')), null);
  });

  test('isKnownRange covers exactly the offered periods', function (assert) {
    assert.deepEqual(RANGES, [
      'last7',
      'last30',
      'thisMonth',
      'lastMonth',
      'custom',
    ]);
    assert.true(RANGES.every((range) => isKnownRange(range)));
    assert.true(isKnownRange(DEFAULT_RANGE));
    assert.false(isKnownRange('garbage'));
    assert.false(isKnownRange(undefined));
  });

  test('resolveRange keeps a complete custom pair and orders it', function (assert) {
    assert.deepEqual(resolveRange('custom', '2026-09-01', '2026-09-10'), {
      from: '2026-09-01',
      to: '2026-09-10',
    });
    assert.deepEqual(resolveRange('custom', '2026-09-10', '2026-09-01'), {
      from: '2026-09-01',
      to: '2026-09-10',
    });
  });

  test('resolveRange falls back to the preset and forwards the zone', function (assert) {
    const dubaiMonth = { from: '2026-09-01', to: '2026-09-30' };
    assert.deepEqual(
      resolveRange('garbage', null, null, ACROSS_MONTH_END, 'Asia/Dubai'),
      dubaiMonth,
    );
    assert.deepEqual(
      resolveRange(
        'custom',
        '2026-09-01',
        null,
        ACROSS_MONTH_END,
        'Asia/Dubai',
      ),
      dubaiMonth,
    );
    assert.deepEqual(
      resolveRange(
        'custom',
        '2026-02-31',
        '2026-09-10',
        ACROSS_MONTH_END,
        'Asia/Dubai',
      ),
      dubaiMonth,
    );
    assert.deepEqual(
      resolveRange('last7', null, null, ACROSS_MONTH_END, 'Asia/Dubai'),
      { from: '2026-08-26', to: '2026-09-01' },
    );
  });

  // 12:00 UTC on 31 Dec 2026 is already 1 Jan 2027 in Kiritimati (UTC+14) but still 31 Dec in Pago_Pago (UTC-11).
  const NEW_YEAR = '2026-12-31T12:00:00Z';
  const EAST = 'Pacific/Kiritimati';
  const WEST = 'Pacific/Pago_Pago';
  const en = 'en-US';

  module('formatCalendarRange', function () {
    const opts = { todayZone: 'UTC', now: '2026-10-14T00:00:00Z' };

    test('reads as one span when both ends share a month', function (assert) {
      assert.strictEqual(
        formatCalendarRange('2026-09-14', '2026-09-20', en, opts),
        '14–20 Sep',
      );
    });

    test('names both months when the span crosses one', function (assert) {
      assert.strictEqual(
        formatCalendarRange('2026-08-23', '2026-09-21', en, opts),
        '23 Aug – 21 Sep',
      );
    });

    test('a single day reads as that day, not as a range', function (assert) {
      assert.strictEqual(
        formatCalendarRange('2026-09-21', '2026-09-21', en, opts),
        '21 Sep',
      );
    });

    test('names the year only outside the current year', function (assert) {
      assert.strictEqual(
        formatCalendarRange('2025-03-31', '2025-06-28', en, opts),
        '31 Mar – 28 Jun 2025',
      );
      assert.strictEqual(
        formatCalendarRange('2025-12-29', '2026-01-04', en, opts),
        '29 Dec 2025 – 4 Jan 2026',
      );
    });

    test('renders in UTC, so neither end shifts a day', function (assert) {
      assert.strictEqual(
        formatCalendarRange('2026-01-01', '2026-01-01', en, opts),
        '1 Jan',
      );
    });

    test('judges the current year in todayZone', function (assert) {
      const range = ['2026-12-01', '2026-12-07', en];
      assert.strictEqual(
        formatCalendarRange(...range, { todayZone: WEST, now: NEW_YEAR }),
        '1–7 Dec',
      );
      assert.strictEqual(
        formatCalendarRange(...range, { todayZone: EAST, now: NEW_YEAR }),
        '1–7 Dec 2026',
      );
    });

    test('returns null when either end is not a calendar date', function (assert) {
      assert.strictEqual(
        formatCalendarRange('2026-09', '2026-09-21', en),
        null,
      );
      assert.strictEqual(
        formatCalendarRange('2026-09-21', '2026-02-31', en),
        null,
      );
      assert.strictEqual(formatCalendarRange(null, undefined, en), null);
    });
  });

  module('compact display formatters', function () {
    test('a date-only value is day first and drops the current year', function (assert) {
      const now = '2026-10-14T00:00:00Z';
      assert.strictEqual(
        formatShortDate('2026-09-22', { locale: en, todayZone: 'UTC', now }),
        '22 Sep',
      );
      assert.strictEqual(
        formatShortDate('2025-09-22', { locale: en, todayZone: 'UTC', now }),
        '22 Sep 2025',
      );
    });

    test('the current year is judged in todayZone across New Year', function (assert) {
      assert.strictEqual(
        formatShortDate('2026-12-20', {
          locale: en,
          todayZone: WEST,
          now: NEW_YEAR,
        }),
        '20 Dec',
      );
      assert.strictEqual(
        formatShortDate('2026-12-20', {
          locale: en,
          todayZone: EAST,
          now: NEW_YEAR,
        }),
        '20 Dec 2026',
      );
      assert.strictEqual(
        formatShortDate('2027-01-02', {
          locale: en,
          todayZone: EAST,
          now: NEW_YEAR,
        }),
        '2 Jan',
      );
    });

    test('an instant renders its day in timeZone', function (assert) {
      const at = (timeZone, todayZone) =>
        formatShortDate(NEW_YEAR, {
          locale: en,
          timeZone,
          todayZone,
          now: NEW_YEAR,
        });
      assert.strictEqual(at(EAST, EAST), '1 Jan');
      assert.strictEqual(at(WEST, WEST), '31 Dec');
      assert.strictEqual(at(WEST, EAST), '31 Dec 2026');
    });

    test('the time has no leading zero on the hour', function (assert) {
      const options = {
        locale: en,
        timeZone: 'Asia/Riyadh',
        todayZone: 'Asia/Riyadh',
        now: '2026-10-14T00:00:00Z',
      };
      assert.strictEqual(
        formatShortDateTime('2026-09-22T03:05:09Z', options),
        '22 Sep, 6:05 AM',
      );
      assert.strictEqual(
        formatShortDateTime('2026-09-22T03:05:09Z', {
          ...options,
          withSeconds: true,
        }),
        '22 Sep, 6:05:09 AM',
      );
      assert.strictEqual(
        formatShortDateTime('2024-09-22T16:05:00Z', options),
        '22 Sep 2024, 7:05 PM',
      );
    });

    test('formatShortTime renders time only, no leading zero', function (assert) {
      assert.strictEqual(
        formatShortTime('2026-09-22T16:05:00Z', {
          locale: en,
          timeZone: 'Asia/Dubai',
        }),
        '8:05 PM',
      );
      assert.strictEqual(formatShortTime('bad'), null);
    });

    test('invalid values and zones render null', function (assert) {
      assert.strictEqual(formatShortDate('bad', { locale: en }), null);
      assert.strictEqual(formatShortDate('2026-02-31', { locale: en }), null);
      assert.strictEqual(formatShortDate(null), null);
      assert.strictEqual(
        formatShortDateTime(NEW_YEAR, { locale: en, timeZone: 'Not/AZone' }),
        null,
      );
    });

    test('dual zone shows only the region time on the same day', function (assert) {
      assert.strictEqual(
        formatDualZoneDateTime(
          '2026-09-22T16:05:00Z',
          'Makkah',
          'Asia/Riyadh',
          {
            locale: en,
            timeZone: 'Asia/Dubai',
            todayZone: 'Asia/Riyadh',
            now: '2026-10-14T00:00:00Z',
          },
        ),
        '22 Sep, 8:05 PM (Makkah 7:05 PM)',
      );
    });

    test('dual zone dates the region part when its day differs', function (assert) {
      assert.strictEqual(
        formatDualZoneDateTime(
          '2026-09-22T23:05:00Z',
          'Makkah',
          'Asia/Riyadh',
          {
            locale: en,
            timeZone: 'America/New_York',
            todayZone: 'Asia/Riyadh',
            now: '2026-10-14T00:00:00Z',
          },
        ),
        '22 Sep, 7:05 PM (Makkah 23 Sep, 2:05 AM)',
      );
      assert.strictEqual(
        formatDualZoneDateTime(NEW_YEAR, 'Line Islands', EAST, {
          locale: en,
          timeZone: WEST,
          todayZone: WEST,
          now: NEW_YEAR,
        }),
        '31 Dec, 1:00 AM (Line Islands 1 Jan 2027, 2:00 AM)',
      );
    });

    test('dual zone drops the region part when it reads the same', function (assert) {
      assert.strictEqual(
        formatDualZoneDateTime('2026-09-22T16:05:00Z', 'Dubai', 'Asia/Muscat', {
          locale: en,
          timeZone: 'Asia/Dubai',
          todayZone: 'Asia/Dubai',
          now: '2026-10-14T00:00:00Z',
        }),
        '22 Sep, 8:05 PM',
      );
    });
  });
});
