import { daysUntil } from 'land/utils/local-date';
import { plural } from 'land/utils/plural';

const EMPTY = { days: null, isOverdue: false, word: '', label: '' };

export function dueStatus(dueDate, today) {
  const days = daysUntil(dueDate, today);
  if (days === null) return { ...EMPTY };
  if (days < 0) {
    return {
      days,
      isOverdue: true,
      word: 'Overdue',
      label: `${plural(-days, 'day')} overdue`,
    };
  }
  if (days === 0) {
    return { days, isOverdue: false, word: 'Due today', label: 'due today' };
  }
  return {
    days,
    isOverdue: false,
    word: 'Upcoming',
    label: `due in ${plural(days, 'day')}`,
  };
}
