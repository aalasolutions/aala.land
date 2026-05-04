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

  @action setLimit(e) {
    this.limit = Number(e.target.value) || 10;
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
