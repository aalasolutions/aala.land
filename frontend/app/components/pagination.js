import Component from '@glimmer/component';

export default class PaginationComponent extends Component {
  get resolvedLimitOptions() {
    return this.args.limitOptions ?? [
      { value: '10', label: '10 rows' },
      { value: '20', label: '20 rows' },
      { value: '50', label: '50 rows' },
    ];
  }

  get selectId() {
    return this.args.selectId || 'pagination-limit';
  }

  get page() {
    return Number(this.args.page) || 1;
  }

  get limit() {
    return Number(this.args.limit) || Number(this.resolvedLimitOptions[0]?.value) || 10;
  }

  get total() {
    return Number(this.args.total) || 0;
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  get disablePrevious() {
    return this.page <= 1;
  }

  get disableNext() {
    return this.page >= this.totalPages;
  }

  get limitOptions() {
    const selectedValue = String(this.limit);

    return this.resolvedLimitOptions.map((option) => ({
      ...option,
      selected: String(option.value) === selectedValue,
    }));
  }
}
