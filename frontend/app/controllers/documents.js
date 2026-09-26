import PaginatedController from './paginated-base';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { debounceTask } from 'ember-lifeline';
import { CATEGORIES, ACCESS_LEVELS, RELATED_TYPES } from 'land/constants';
import { localMidnightIso } from 'land/utils/local-date';

export default class DocumentsController extends PaginatedController {
  queryParams = [
    'page',
    'limit',
    'category',
    'search',
    'accessLevel',
    'dateFrom',
    'dateTo',
    'related',
  ];
  @tracked category = '';
  @tracked search = '';
  @tracked accessLevel = '';
  @tracked dateFrom = '';
  @tracked dateTo = '';
  @tracked related = '';

  resetState() {
    this.page = 1;
    this.category = '';
    this.search = '';
    this.accessLevel = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.related = '';
  }

  get categories() {
    return CATEGORIES;
  }

  relatedTypes = RELATED_TYPES;

  get accessLevelFilterOptions() {
    return [{ value: '', label: 'All access levels' }, ...ACCESS_LEVELS];
  }

  // The panel owns the list fetch; the URL filters reach it as query params.
  get panelFilters() {
    return {
      category: this.category,
      search: this.search,
      accessLevel: this.accessLevel,
      dateFrom: localMidnightIso(this.dateFrom),
      dateTo: localMidnightIso(this.dateTo, 1),
      related: this.related,
    };
  }

  get hasActiveFilters() {
    return Boolean(
      this.category ||
      this.search ||
      this.accessLevel ||
      this.dateFrom ||
      this.dateTo ||
      this.related,
    );
  }

  // Nuvo::Dropdown calls onSelect with the value.
  @action setCategory(value) {
    this.category = value;
    this.page = 1;
  }

  @action setAccessLevelFilter(value) {
    this.accessLevel = value;
    this.page = 1;
  }

  @action setRelated(value) {
    this.related = value;
    this.page = 1;
  }

  @action setPage(page) {
    this.page = page;
  }

  @action updateFilter(fieldName, e) {
    debounceTask(this, 'applyFilter', fieldName, e.target.value, 500);
  }

  applyFilter(fieldName, value) {
    this[fieldName] = value;
    this.page = 1;
  }

  @action setDateFrom(e) {
    this.dateFrom = e.target.value;
    this.page = 1;
  }

  @action setDateTo(e) {
    this.dateTo = e.target.value;
    this.page = 1;
  }

  @action clearFilters() {
    this.category = '';
    this.search = '';
    this.accessLevel = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.related = '';
    this.page = 1;
  }
}
