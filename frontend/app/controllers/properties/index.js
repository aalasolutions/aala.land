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

  @tracked showModal = false;
  @tracked showImportModal = false;
  @tracked editArea = null;
  @tracked formName = '';
  @tracked formLocation = '';
  @tracked formDescription = '';
  @tracked formRegionCode = '';
  @tracked selectedCity = null;
  @tracked selectedLocality = null;
  @tracked isSaving = false;
  @tracked errorMsg = '';

  get showRegionField() {
    return this.region.regions.length > 1;
  }

  @tracked importFile = null;
  @tracked importPreview = null;
  @tracked importResults = null;
  @tracked isImporting = false;

  // Browse Units view
  @tracked activeView = 'areas';
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

  get citySearchUrl() {
    const code = this.formRegionCode || this.region.regionCode;
    return code ? `/locations/cities/search?regionCode=${code}` : null;
  }

  get localitySearchUrl() {
    return this.selectedCity ? `/locations/localities/search?cityId=${this.selectedCity.id}` : null;
  }

  get cityCreatePayload() {
    return { regionCode: this.formRegionCode || this.region.regionCode };
  }

  get localityCreatePayload() {
    return this.selectedCity ? { cityId: this.selectedCity.id } : {};
  }

  @action selectCity(city) {
    this.selectedCity = city;
    this.selectedLocality = null;
  }

  @action clearCity() {
    this.selectedCity = null;
    this.selectedLocality = null;
  }

  @action selectLocality(locality) {
    this.selectedLocality = locality;
  }

  @action clearLocality() {
    this.selectedLocality = null;
  }

  @action openCreate() {
    this.formName = '';
    this.formLocation = '';
    this.formDescription = '';
    this.formRegionCode = this.region.regionCode;
    this.selectedCity = null;
    this.selectedLocality = null;
    this.editArea = null;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openEdit(area) {
    this.formName = area.name;
    this.formLocation = area.location ?? '';
    this.formDescription = area.description ?? '';
    this.selectedCity = area.city ?? null;
    this.selectedLocality = area.locality ?? null;
    this.editArea = area;
    this.errorMsg = '';
    this.showModal = true;
  }

  @action openImport() {
    this.importFile = null;
    this.importPreview = null;
    this.importResults = null;
    this.showImportModal = true;
  }

  @action closeModal() {
    this.showModal = false;
    this.editArea = null;
    this.errorMsg = '';
  }

  @action closeImportModal() {
    this.showImportModal = false;
    this.importFile = null;
    this.importPreview = null;
    this.importResults = null;
  }

  @action handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      this.importFile = file;
      this.parseCSV(file);
    } else {
      this.notifications.error('Please select a CSV file');
    }
  }

  @action async parseCSV(file) {
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const values = line.split(',');
      const row = {};
      headers.forEach((h, i) => row[h] = values[i]?.trim());
      return row;
    }).filter(r => r.areaName);

    this.importPreview = rows.slice(0, 10);
  }

  @action async importProperties() {
    if (!this.importFile || this.isImporting) return;

    this.isImporting = true;
    this.importResults = null;

    try {
      const formData = new FormData();
      formData.append('file', this.importFile);

      const res = await this.auth.authorizedFetch(`${this.auth.apiBase}/properties/bulk-import`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Import failed');
      }

      this.importResults = await res.json();
      this.notifications.success(`Import complete: ${this.importResults.created} created, ${this.importResults.failed} failed`);

      if (this.importResults.created > 0) {
        this.router.refresh('properties.index');
      }
    } catch (e) {
      this.notifications.error(e.message);
    } finally {
      this.isImporting = false;
    }
  }

  @action downloadTemplate() {
    const csv = 'areaName,location\nGulberg,Lahore\nDHA Phase 5,Karachi\nBandra West,Mumbai';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'properties-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  @action async saveArea(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';

    const isEdit = !!this.editArea;
    const path = isEdit ? `/properties/areas/${this.editArea.id}` : '/properties/areas';

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: this.formName,
          location: this.formLocation,
          description: this.formDescription,
          ...(!isEdit && this.formRegionCode ? { regionCode: this.formRegionCode } : {}),
        }),
      });
      this.notifications.success(isEdit ? 'Area updated' : 'Area created');
      this.closeModal();
      this.router.refresh('properties.index');
    } catch (e) {
      this.errorMsg = e.message;
    } finally {
      this.isSaving = false;
    }
  }
}
