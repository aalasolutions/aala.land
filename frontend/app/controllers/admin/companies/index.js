import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { debounceTask } from 'ember-lifeline';

const SEARCH_DEBOUNCE_MS = 500;

const RAIL_OPTIONS = [
  { value: '', label: 'All rails' },
  { value: 'card', label: 'Card' },
  { value: 'manual', label: 'Manual' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'deal', label: 'On a deal' },
  { value: 'lifted', label: 'Lifted' },
  { value: 'locked', label: 'Locked' },
];

export default class AdminCompaniesIndexController extends Controller {
  @service router;

  queryParams = ['page', 'limit', 'search'];

  @tracked page = 1;
  @tracked limit = 20;
  @tracked search = '';

  // Client-side refinements on the loaded page (backend filters by search).
  @tracked railFilter = '';
  @tracked statusFilter = '';

  railOptions = RAIL_OPTIONS;
  statusOptions = STATUS_OPTIONS;

  get rows() {
    const rows = this.model.rows ?? [];
    return rows.filter((row) => {
      if (this.railFilter && row.rail !== this.railFilter) return false;
      if (this.statusFilter && row.status !== this.statusFilter) return false;
      return true;
    });
  }

  get total() {
    return this.model.total ?? 0;
  }

  @action
  setSearch(value) {
    debounceTask(this, 'applySearch', value, SEARCH_DEBOUNCE_MS);
  }

  applySearch(value) {
    this.search = value;
    this.page = 1;
  }

  @action
  setRail(value) {
    this.railFilter = value;
  }

  @action
  setStatus(value) {
    this.statusFilter = value;
  }

  @action
  openCompany(id, event) {
    // The company name is a real LinkTo (keyboard path); let it own its own
    // click so the row handler does not fire the same transition twice.
    if (event?.target?.closest('a')) return;
    this.router.transitionTo('admin.companies.company', id);
  }

  @action
  previousPage() {
    const page = Number(this.page) || 1;
    if (page > 1) this.page = page - 1;
  }

  @action
  nextPage() {
    this.page = (Number(this.page) || 1) + 1;
  }

  @action
  changeLimit(value) {
    this.limit = Number(value);
    this.page = 1;
  }
}
