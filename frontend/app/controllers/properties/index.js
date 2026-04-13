import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { AMENITY_OPTIONS } from '../../constants/amenities';

export default class PropertiesIndexController extends Controller {
  @service auth;
  @service notifications;
  @service router;
  @service region;
  @service preferences;

  @tracked activeView = null;

  get currentView() {
    if (this.activeView) return this.activeView;
    return this.preferences.get('properties-index-view', 'cards');
  }
  @tracked browseUnits = [];
  @tracked browseTotal = 0;
  @tracked browsePage = 1;
  @tracked isLoadingBrowse = false;

  @tracked filterType = '';
  @tracked filterStatus = '';
  @tracked filterBeds = '';
  @tracked filterMinPrice = '';
  @tracked filterMaxPrice = '';
  @tracked filterAmenities = [];

  get amenityOptions() { return AMENITY_OPTIONS; }

  get browseHasNextPage() {
    return this.browseTotal > this.browsePage * 20;
  }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action switchView(view) {
    this.activeView = view;
    this.preferences.set('properties-index-view', view);
    if (view === 'browse' && this.browseUnits.length === 0) {
      this.loadBrowseUnits();
    }
  }

  @action setFilterType(e) { this.filterType = e.target.value; this.applyFilters(); }
  @action setFilterStatus(e) { this.filterStatus = e.target.value; this.applyFilters(); }
  @action setFilterBeds(e) { this.filterBeds = e.target.value; this.applyFilters(); }

  @action applyFilters() {
    this.browsePage = 1;
    this.loadBrowseUnits();
  }

  @action clearFilters() {
    this.filterType = '';
    this.filterStatus = '';
    this.filterBeds = '';
    this.filterMinPrice = '';
    this.filterMaxPrice = '';
    this.filterAmenities = [];
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
    this.isLoadingBrowse = true;
    try {
      let params = `page=${this.browsePage}&limit=20`;
      if (this.filterType) params += `&propertyType=${this.filterType}`;
      if (this.filterStatus) params += `&status=${this.filterStatus}`;
      if (this.filterMinPrice) params += `&minPrice=${this.filterMinPrice}`;
      if (this.filterMaxPrice) params += `&maxPrice=${this.filterMaxPrice}`;
      if (this.filterBeds) {
        params += `&minBeds=${this.filterBeds}`;
        params += `&maxBeds=${this.filterBeds === '4' ? '99' : this.filterBeds}`;
      }
      if (this.filterAmenities.length) params += `&amenities=${this.filterAmenities.join(',')}`;
      const json = await this.auth.fetchJson(`/properties/units?${params}`);
      this.browseUnits = json.data?.data ?? [];
      this.browseTotal = json.data?.total ?? 0;
    } catch {
      this.browseUnits = [];
      this.browseTotal = 0;
    } finally {
      this.isLoadingBrowse = false;
    }
  }

  // New Unit modal (cascading: city > location > asset > unit fields)
  @tracked showNewUnitModal = false;
  @tracked selectedCity = null;
  @tracked selectedLocality = null;
  @tracked selectedAsset = null;
  @tracked newUnitNumber = '';
  @tracked newUnitType = '';
  @tracked newUnitStatus = 'available';
  @tracked newUnitPrice = '';
  @tracked newUnitBedrooms = '';
  @tracked newUnitBathrooms = '';
  @tracked newUnitError = '';
  @tracked isSavingNewUnit = false;

  get citySearchUrl() {
    return this.region.regionCode ? '/locations/cities/search' : null;
  }

  get cityCreatePayload() {
    return { regionCode: this.region.regionCode };
  }

  get localitySearchUrl() {
    return this.selectedCity ? `/locations/localities/search?cityId=${this.selectedCity.id}` : null;
  }

  get localityCreatePayload() {
    return this.selectedCity ? { cityId: this.selectedCity.id } : {};
  }

  get assetSearchUrl() {
    return this.selectedLocality ? `/properties/assets/search?localityId=${this.selectedLocality.id}` : null;
  }

  get assetCreatePayload() {
    return this.selectedLocality ? { localityId: this.selectedLocality.id } : {};
  }

  @action selectCity(city) {
    this.selectedCity = city;
    this.selectedLocality = null;
    this.selectedAsset = null;
  }

  @action clearCity() {
    this.selectedCity = null;
    this.selectedLocality = null;
    this.selectedAsset = null;
  }

  @action selectLocality(locality) {
    this.selectedLocality = locality;
    this.selectedAsset = null;
  }

  @action clearLocality() {
    this.selectedLocality = null;
    this.selectedAsset = null;
  }

  @action selectAsset(asset) {
    this.selectedAsset = asset;
  }

  @action clearAsset() {
    this.selectedAsset = null;
  }

  @action openNewUnitModal() {
    this.selectedCity = null;
    this.selectedLocality = null;
    this.selectedAsset = null;
    this.newUnitNumber = '';
    this.newUnitType = '';
    this.newUnitStatus = 'available';
    this.newUnitPrice = '';
    this.newUnitBedrooms = '';
    this.newUnitBathrooms = '';
    this.newUnitError = '';
    this.showNewUnitModal = true;
  }

  @action closeNewUnitModal() {
    this.showNewUnitModal = false;
    this.newUnitError = '';
  }

  @action async saveNewUnit(event) {
    event.preventDefault();
    if (this.isSavingNewUnit) return;

    if (!this.selectedAsset) {
      this.newUnitError = 'Please select a city, location, and asset first.';
      return;
    }
    if (!this.newUnitNumber.trim()) {
      this.newUnitError = 'Unit number is required.';
      return;
    }

    this.isSavingNewUnit = true;
    this.newUnitError = '';

    const body = {
      assetId: this.selectedAsset.id,
      unitNumber: this.newUnitNumber.trim(),
      status: this.newUnitStatus,
      ...(this.newUnitType ? { propertyType: this.newUnitType } : {}),
      ...(this.newUnitPrice ? { price: parseFloat(this.newUnitPrice) } : {}),
      ...(this.newUnitBedrooms ? { bedrooms: parseInt(this.newUnitBedrooms, 10) } : {}),
      ...(this.newUnitBathrooms ? { bathrooms: parseInt(this.newUnitBathrooms, 10) } : {}),
    };

    try {
      await this.auth.fetchJson('/properties/units', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success('Unit created');
      this.closeNewUnitModal();
      this.router.refresh('properties.index');
    } catch (e) {
      this.newUnitError = e.message;
    } finally {
      this.isSavingNewUnit = false;
    }
  }
}
