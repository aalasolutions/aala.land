import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import {
  AMENITY_OPTIONS,
  PROPERTY_FILTER_STATUS_OPTIONS,
  FILTER_TYPE_OPTIONS,
  FILTER_BEDS_OPTIONS,
  ARCHIVED_FILTER_OPTIONS,
} from 'land/constants';

export default class PropertiesIndexController extends Controller {
  queryParams = ['archived'];
  @service auth;
  @service router;
  @service preferences;

  @tracked activeView = null;

  columns = [
    { name: 'Location', valuePath: 'name', width: 220, isFixed: 'left' },
    { name: 'City', valuePath: 'cityName', width: 180 },
    { name: 'Assets', valuePath: 'assetCount', width: 120, numeric: true },
    { name: 'Properties', valuePath: 'unitCount', width: 130, numeric: true },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 100,
      isFixed: 'right',
      isSortable: false,
      isResizable: false,
    },
  ];

  get currentView() {
    // Other views are not yet implemented, so always default to browse for now
    return 'browse';
  }

  viewTabs = [
    { value: 'cards', label: 'Cards', icon: 'squares-four' },
    { value: 'list', label: 'List', icon: 'list' },
    { value: 'browse', label: 'Browse Properties', icon: 'grid-four' },
  ];
  @tracked browseUnits = [];
  @tracked browseTotal = 0;
  @tracked browsePage = 1;
  @tracked isLoadingBrowse = false;
  browseRequestId = 0;

  @tracked filterType = '';
  @tracked filterStatus = '';
  @tracked filterBeds = '';
  @tracked filterMinPrice = '';
  @tracked filterMaxPrice = '';
  @tracked filterAmenities = [];
  @tracked archived = 'exclude';

  archivedFilterOptions = ARCHIVED_FILTER_OPTIONS;

  get archivedFilterValue() {
    return ARCHIVED_FILTER_OPTIONS.some((o) => o.value === this.archived)
      ? this.archived
      : 'exclude';
  }

  // Empty field means the backend's default order (locality, asset, unit number).
  @tracked sortField = '';
  @tracked sortDirection = 'asc';

  sortFieldOptions = [
    { value: '', label: 'Default (location)' },
    { value: 'name', label: 'Name' },
    { value: 'price', label: 'Price' },
    { value: 'area', label: 'Area' },
    { value: 'added', label: 'Date added' },
  ];

  browseLayoutOptions = [
    { value: 'grid', label: 'Grid view', icon: 'squares-four' },
    { value: 'list', label: 'List view', icon: 'list' },
  ];

  @tracked _browseLayout = null;

  get browseLayout() {
    return (
      this._browseLayout ??
      this.preferences.get('properties-browse-layout', 'grid')
    );
  }

  amenityOptions = AMENITY_OPTIONS;

  filterTypeOptions = FILTER_TYPE_OPTIONS;

  filterStatusOptions = PROPERTY_FILTER_STATUS_OPTIONS;

  filterBedsOptions = FILTER_BEDS_OPTIONS;

  get browseHasNextPage() {
    return this.browseTotal > this.browsePage * 20;
  }

  get hasActiveFilters() {
    return Boolean(
      this.filterType ||
        this.filterStatus ||
        this.filterBeds ||
        this.filterMinPrice ||
        this.filterMaxPrice ||
        this.filterAmenities.length ||
        this.archivedFilterValue !== 'exclude',
    );
  }

  @action setField(fieldName, e) {
    this[fieldName] = e.target.value;
  }

  // Kit form components call onInput/onChange as (value, event).
  @action setFieldValue(fieldName, value) {
    this[fieldName] = value;
  }

  @action switchView(view) {
    this.activeView = view;
    this.preferences.set('properties-index-view', view);
    if (view === 'browse' && this.browseUnits.length === 0) {
      this.loadBrowseUnits();
    }
  }

  @action setBrowseLayout(layout) {
    this._browseLayout = layout;
    this.preferences.set('properties-browse-layout', layout);
  }

  @action setFilterType(value) {
    this.filterType = value;
    this.applyFilters();
  }

  @action setFilterStatus(value) {
    this.filterStatus = value;
    this.applyFilters();
  }

  @action setFilterBeds(value) {
    this.filterBeds = value;
    this.applyFilters();
  }

  @action setArchivedFilter(value) {
    this.archived = value || 'exclude';
    this.browsePage = 1;
  }

  @action applyFilters() {
    this.browsePage = 1;
    this.loadBrowseUnits();
  }

  @action setSortField(value) {
    this.sortField = value;
    this.applyFilters();
  }

  @action toggleSortDirection() {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.applyFilters();
  }

  @action clearFilters() {
    this.filterType = '';
    this.filterStatus = '';
    this.filterBeds = '';
    this.filterMinPrice = '';
    this.filterMaxPrice = '';
    this.filterAmenities = [];
    this.archived = 'exclude';
    this.browsePage = 1;
    this.loadBrowseUnits();
  }

  @action toggleBrowseAmenity(key) {
    const current = [...this.filterAmenities];
    const idx = current.indexOf(key);
    if (idx === -1) {
      current.push(key);
    } else {
      current.splice(idx, 1);
    }
    this.filterAmenities = current;
    this.applyFilters();
  }

  @action browsePrevPage() {
    if (this.browsePage > 1) {
      this.browsePage = this.browsePage - 1;
      this.loadBrowseUnits();
    }
  }

  @action browseNextPage() {
    if (this.browseHasNextPage) {
      this.browsePage = this.browsePage + 1;
      this.loadBrowseUnits();
    }
  }

  @action async loadBrowseUnits() {
    const requestId = ++this.browseRequestId;
    this.isLoadingBrowse = true;
    try {
      let params = `page=${this.browsePage}&limit=20`;
      if (this.archivedFilterValue !== 'exclude')
        params += `&archived=${this.archivedFilterValue}`;
      if (this.filterType) params += `&propertyType=${this.filterType}`;
      if (this.filterStatus) params += `&status=${this.filterStatus}`;
      if (this.filterMinPrice) params += `&minPrice=${this.filterMinPrice}`;
      if (this.filterMaxPrice) params += `&maxPrice=${this.filterMaxPrice}`;
      if (this.filterBeds) {
        params += `&minBeds=${this.filterBeds}`;
        params += `&maxBeds=${this.filterBeds === '4' ? '99' : this.filterBeds}`;
      }
      if (this.filterAmenities.length)
        params += `&amenities=${this.filterAmenities.join(',')}`;
      if (this.sortField)
        params += `&sort=${this.sortField}&order=${this.sortDirection}`;
      const json = await this.auth.fetchJson(`/properties/units?${params}`);
      if (requestId !== this.browseRequestId) return;
      this.browseUnits = json.data?.data ?? [];
      this.browseTotal = json.data?.total ?? 0;
    } catch {
      if (requestId !== this.browseRequestId) return;
      this.browseUnits = [];
      this.browseTotal = 0;
    } finally {
      if (requestId === this.browseRequestId) {
        this.isLoadingBrowse = false;
      }
    }
  }

  @tracked showNewUnitModal = false;

  @action openNewUnitModal() {
    this.showNewUnitModal = true;
  }

  @action closeNewUnitModal() {
    this.showNewUnitModal = false;
  }

  @action refresh() {
    this.router.refresh('properties.index');
  }
}
