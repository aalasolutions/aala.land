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
import { unitsListFilters } from '../../utils/units-query';
import { saveResponseAsFile } from '../../utils/download';

const EXPORT_WAIT_NOTICE_MS = 1000;
export const EXPORT_CAP = 20000;

export default class PropertiesIndexController extends Controller {
  queryParams = ['archived'];
  @service auth;
  @service router;
  @service preferences;
  @service region;
  @service dataTransfer;
  @service notifications;

  @tracked activeView = null;

  columns = [
    { name: 'Location', valuePath: 'name', width: 220, isFixed: 'left' },
    { name: 'City', valuePath: 'cityName', width: 180 },
    { name: 'Assets', valuePath: 'assetCount', width: 120, numeric: true },
    { name: 'Properties', valuePath: 'unitCount', width: 130, numeric: true },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 90,
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
  @tracked browseLimit = 50;
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
    return this.browseTotal > this.browsePage * this.browseLimit;
  }

  get isBrowseEmpty() {
    return (
      this.currentView === 'browse' &&
      !this.isLoadingBrowse &&
      this.browseUnits.length === 0
    );
  }

  get showBrowsePager() {
    return this.currentView === 'browse' && this.browseTotal > 0;
  }

  get hasActiveFilters() {
    return this.activeFilterCount > 0;
  }

  get activeFilterCount() {
    return [
      this.filterType,
      this.filterStatus,
      this.filterBeds,
      this.filterMinPrice,
      this.filterMaxPrice,
      this.filterAmenities.length,
      this.archivedFilterValue !== 'exclude',
    ].filter(Boolean).length;
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

  @action goToBrowsePage(page) {
    this.browsePage = page;
    this.loadBrowseUnits();
  }

  @action setBrowseLimit(limit) {
    this.browseLimit = limit;
    this.applyFilters();
  }

  // The same query the browse list sends, minus paging and sort, so the file matches the page.
  get exportParams() {
    return unitsListFilters(this, { regionCode: this.region.regionCode });
  }

  @action async exportUnits(format) {
    const notice = setTimeout(
      () => this.notifications.info('Preparing your file'),
      EXPORT_WAIT_NOTICE_MS,
    );
    try {
      const response = await this.dataTransfer.exportList(
        'units',
        this.exportParams,
        format,
      );
      clearTimeout(notice);
      await saveResponseAsFile(response, `units.${format}`);
      if (response.headers.get('X-Export-Truncated') === 'true') {
        this.notifications.info(
          `Only the first ${EXPORT_CAP.toLocaleString()} properties were exported. Narrow the filters to export the rest.`,
        );
      }
    } catch (error) {
      clearTimeout(notice);
      this.notifications.error(error.message);
    }
  }

  @action async loadBrowseUnits() {
    const requestId = ++this.browseRequestId;
    this.isLoadingBrowse = true;
    try {
      const params = new URLSearchParams(unitsListFilters(this));
      params.set('page', this.browsePage);
      params.set('limit', this.browseLimit);
      if (this.sortField) {
        params.set('sort', this.sortField);
        params.set('order', this.sortDirection);
      }
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
