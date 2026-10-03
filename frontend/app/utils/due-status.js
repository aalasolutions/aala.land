import { daysUntil } from 'land/utils/local-date';

const EMPTY = { days: null, isOverdue: false, word: '', label: '' };

const plural = (n) => (n === 1 ? 'day' : 'days');

export function dueStatus(dueDate, today) {
  const days = daysUntil(dueDate, today);
  if (days === null) return { ...EMPTY };
  if (days < 0) {
    return {
      days,
      isOverdue: true,
      word: 'Overdue',
      label: `${-days} ${plural(-days)} overdue`,
    };
  }
  if (days === 0) {
    return { days, isOverdue: false, word: 'Due today', label: 'due today' };
  }
  return {
    days,
    isOverdue: false,
    word: 'Upcoming',
    label: `due in ${days} ${plural(days)}`,
  };
}
