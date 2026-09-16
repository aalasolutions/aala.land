import Component from '@glimmer/component';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';

const DEFAULT_PER_PAGE_OPTIONS = [10, 25, 50, 100];

export default class NuPaginationComponent extends Component {
  // Per-instance so two paginations on one page do not emit duplicate ids and break their labels.
  get selectId() {
    return this.args.selectId ?? `${guidFor(this)}-per-page`;
  }

  get perPageOptions() {
    return this.args.perPageOptions ?? DEFAULT_PER_PAGE_OPTIONS;
  }

  get showPerPage() {
    return Boolean(this.args.onPerPageChange || this.args.onLimitChange);
  }

  get classes() {
    const parts = ['nu-pagination'];
    if (this.args.sm) {
      parts.push('m-sm');
    }
    if (this.args.compact) {
      parts.push('m-compact');
    }
    return parts.join(' ');
  }

  get page() {
    return Number(this.args.page) || 1;
  }

  get perPage() {
    return Number(this.args.perPage ?? this.args.limit) || 10;
  }

  get total() {
    return Number(this.args.total) || 0;
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.total / this.perPage));
  }

  get disablePrevious() {
    return this.page <= 1;
  }

  get disableNext() {
    return this.page >= this.totalPages;
  }

  // Compact list: first, last, current, one neighbour each side, ellipsis between.
  get pages() {
    const total = this.totalPages;
    const current = this.page;
    const items = [];

    if (total <= 7) {
      for (let n = 1; n <= total; n++) {
        items.push({ type: 'page', number: n, active: n === current });
      }
      return items;
    }

    const addPage = (n) =>
      items.push({ type: 'page', number: n, active: n === current });
    const addEllipsis = (key) => items.push({ type: 'ellipsis', key });

    addPage(1);

    if (current > 3) {
      addEllipsis('start');
    }

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let n = start; n <= end; n++) {
      addPage(n);
    }

    if (current < total - 2) {
      addEllipsis('end');
    }

    addPage(total);

    return items;
  }

  get statusText() {
    if (!this.total) {
      return '0 results';
    }
    const start = (this.page - 1) * this.perPage + 1;
    const end = Math.min(this.page * this.perPage, this.total);
    return `${start}-${end} of ${this.total}`;
  }

  @action
  goToPage(page) {
    if (page < 1 || page > this.totalPages || page === this.page) {
      return;
    }
    this.args.onPageChange?.(page);
  }

  // Own callbacks let a step-only controller work without a page-number model.
  @action
  goToPrevious() {
    if (this.page <= 1) {
      return;
    }
    if (this.args.onPrevious) {
      this.args.onPrevious();
      return;
    }
    this.goToPage(this.page - 1);
  }

  @action
  goToNext() {
    if (this.page >= this.totalPages) {
      return;
    }
    if (this.args.onNext) {
      this.args.onNext();
      return;
    }
    this.goToPage(this.page + 1);
  }

  @action
  changePerPage(event) {
    const value = Number(event.target.value);
    this.args.onPerPageChange?.(value);
    this.args.onLimitChange?.(value);
  }
}
