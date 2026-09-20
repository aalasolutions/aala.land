import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { validPage } from 'land/utils/page-number';

export default class PaginatedController extends Controller {
  @tracked page = 1;
  @tracked limit = 50;

  get totalPages() {
    if (!this.model) return 0;
    return Math.max(1, Math.ceil(this.model.total / this.limit));
  }

  // Accepts a raw event (legacy Ui::Pagination) or a number (Nuvo::Pagination) during migration.
  @action setLimit(input) {
    const raw =
      typeof input === 'object' && input !== null ? input.target?.value : input;
    this.limit = Number(raw) || 50;
    this.page = 1;
  }

  @action goToPreviousPage() {
    const page = Number(this.page) || 1;
    if (page <= 1) return;
    this.page = page - 1;
  }

  @action goToPage(page) {
    const target = validPage(page, this.totalPages);
    if (target === null) return;
    this.page = target;
  }

  @action goToNextPage() {
    const page = Number(this.page) || 1;
    if (page >= this.totalPages) return;
    this.page = page + 1;
  }
}
