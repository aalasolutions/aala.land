import { module, test } from 'qunit';
import { dueStatus } from 'land/utils/due-status';

const TODAY = '2026-10-10';

module('Unit | Utility | due-status', function () {
  test('a past date is overdue, singular and plural', function (assert) {
    assert.deepEqual(dueStatus('2026-09-28', TODAY), {
      days: -12,
      isOverdue: true,
      word: 'Overdue',
      label: '12 days overdue',
    });
    assert.deepEqual(dueStatus('2026-10-09', TODAY), {
      days: -1,
      isOverdue: true,
      word: 'Overdue',
      label: '1 day overdue',
    });
  });

  test('today is due today and not overdue', function (assert) {
    assert.deepEqual(dueStatus(TODAY, TODAY), {
      days: 0,
      isOverdue: false,
      word: 'Due today',
      label: 'due today',
    });
  });

  test('a future date is upcoming, singular and plural', function (assert) {
    assert.deepEqual(dueStatus('2026-10-11', TODAY), {
      days: 1,
      isOverdue: false,
      word: 'Upcoming',
      label: 'due in 1 day',
    });
    assert.deepEqual(dueStatus('2026-10-13', TODAY), {
      days: 3,
      isOverdue: false,
      word: 'Upcoming',
      label: 'due in 3 days',
    });
  });

  test('a missing or invalid date gives an empty status', function (assert) {
    const empty = { days: null, isOverdue: false, word: '', label: '' };
    assert.deepEqual(dueStatus('', TODAY), empty);
    assert.deepEqual(dueStatus(null, TODAY), empty);
    assert.deepEqual(dueStatus('not-a-date', TODAY), empty);
  });
});
