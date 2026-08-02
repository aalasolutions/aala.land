import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PaginatedController extends Controller {
  @tracked page = 1;
  @tracked limit = 10;

  get totalPages() {
    if (!this.model) return 0;
    return Math.max(1, Math.ceil(this.model.total / this.limit));
  }

  // Accepts either a raw change event (legacy Ui::Pagination) or a number
  // (Nuvo::Pagination), so pages can move to the kit component one at a time.
  @action setLimit(input) {
    const raw = typeof input === 'object' && input !== null
      ? input.target?.value
      : input;
    this.limit = Number(raw) || 10;
    this.page = 1;
  }

  @action goToPreviousPage() {
    const page = Number(this.page) || 1;
    if (page <= 1) return;
    this.page = page - 1;
  }

  @action goToNextPage() {
    const page = Number(this.page) || 1;
    if (page >= this.totalPages) return;
    this.page = page + 1;
  }
}
