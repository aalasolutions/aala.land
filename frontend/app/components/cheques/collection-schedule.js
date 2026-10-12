import Component from '@glimmer/component';
import { daysUntil } from 'land/utils/local-date';

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export default class ChequesCollectionScheduleComponent extends Component {
  get groups() {
    return (this.args.groups ?? []).map((group) => {
      const totals = new Map();
      for (const cheque of group.cheques) {
        const code = cheque.currency ?? '';
        totals.set(code, (totals.get(code) ?? 0) + Number(cheque.amount || 0));
      }
      return {
        ...group,
        isOverdue: group.period === 'Overdue',
        totals: [...totals].map(([currency, amount]) => ({ currency, amount })),
        cheques: group.cheques.map((cheque) => ({
          ...cheque,
          when: this.when(cheque.dueDate),
        })),
      };
    });
  }

  when(dueDate) {
    const days = daysUntil(dueDate);
    if (days === null) return '';
    if (days === 0) return 'Due today';
    if (days < 0) return `${plural(-days, 'day')} overdue`;
    return `In ${plural(days, 'day')}`;
  }
}
