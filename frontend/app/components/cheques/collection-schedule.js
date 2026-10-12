import Component from '@glimmer/component';

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
      };
    });
  }
}
