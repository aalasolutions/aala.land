import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { validPage } from 'land/utils/page-number';
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
  @tracked limit = 50;
  @tracked search = '';

  // Client-side refinements on the loaded page (backend filters by search).
  @tracked railFilter = '';
  @tracked statusFilter = '';

  railOptions = RAIL_OPTIONS;
  statusOptions = STATUS_OPTIONS;

  columns = [
    { name: 'Company', valuePath: 'name', width: 240, isFixed: 'left' },
    { name: 'Plan', valuePath: 'tier', width: 120 },
    { name: 'Rail', valuePath: 'rail', width: 120 },
    { name: 'Seats', valuePath: 'seatsUsed', width: 120, numeric: true },
    { name: 'MRR', valuePath: 'mrr.amountMinor', width: 140, numeric: true },
    { name: 'Status', valuePath: 'status', width: 160 },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 100,
      isFixed: 'right',
      isSortable: false,
      isResizable: false,
    },
  ];

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
  openCompany(row) {
    this.router.transitionTo('admin.companies.company', row.id);
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

  get totalPages() {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  @action
  goToPage(page) {
    const target = validPage(page, this.totalPages);
    if (target === null) return;
    this.page = target;
  }

  @action
  changeLimit(value) {
    this.limit = Number(value);
    this.page = 1;
  }
}
