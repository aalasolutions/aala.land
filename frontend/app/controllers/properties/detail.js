import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { AMENITY_OPTIONS } from '../../constants/amenities';
import { toggleArrayItem } from '../../utils/toggle-array-item';

export default class PropertiesDetailController extends Controller {
  @service auth;
  @service notifications;
  @service router;

  @tracked owners = [];
  @tracked isLoadingOwners = false;

  @tracked tenantHistoryCache = new Map();
  @tracked _historyVersion = 0;

  @action
  async loadTenantHistory() {
    const assets = this.model?.assets || [];
    const unitIds = [];

    for (const asset of assets) {
      const units = asset.units || [];
      for (const unit of units) {
        unitIds.push(unit.id);
      }
    }

    await Promise.all(unitIds.map(unitId => this._loadTenantHistoryForUnit(unitId)));
    this._historyVersion = (this._historyVersion || 0) + 1;
  }

  @action
  async loadOwners() {
    this.isLoadingOwners = true;
    try {
      const result = await this.auth.fetchJson('/owners?limit=100');
      this.owners = result.data?.data || [];
    } catch (e) {
      console.error('Failed to load owners:', e);
    } finally {
      this.isLoadingOwners = false;
    }
  }

  async _loadTenantHistoryForUnit(unitId) {
    try {
      const result = await this.auth.fetchJson(`/leases/unit/${unitId}`);
      const leases = result.data || [];

      const tenantHistory = leases
        .filter(lease => lease.status === 'COMPLETED' || lease.status === 'EXPIRED')
        .map(lease => ({
          tenantName: lease.tenantName,
          startDate: lease.startDate ? new Date(lease.startDate).toLocaleDateString() : 'N/A',
          endDate: lease.endDate ? new Date(lease.endDate).toLocaleDateString() : 'Present',
        }));

      this.tenantHistoryCache.set(unitId, tenantHistory);
    } catch (e) {
      console.error(`Failed to load tenant history for unit ${unitId}:`, e);
      this.tenantHistoryCache.set(unitId, []);
    }
  }

  getTenantHistory(unitId) {
    return this.tenantHistoryCache.get(unitId) || [];
  }

  get assetsWithHistory() {
    const version = this._historyVersion;
    const assets = this.model?.assets || [];

    return assets.map(asset => ({
      ...asset,
      units: (asset.units || []).map(unit => ({
        ...unit,
        tenantHistory: this.getTenantHistory(unit.id),
      })),
    }));
  }

  @service region;

  // Asset modal
  @tracked showAssetModal = false;
  @tracked editAsset = null;
  @tracked formAssetName = '';
  @tracked formAssetAddress = '';
  @tracked isSavingAsset = false;
  @tracked assetError = '';
  @tracked selectedCity = null;
  @tracked selectedLocality = null;

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

  // Unit modal
  @tracked showUnitModal = false;
  @tracked editUnit = null;
  @tracked activeAssetId = null;
  @tracked formUnitNumber = '';
  @tracked formUnitStatus = 'available';
  @tracked formUnitPropertyType = '';
  @tracked formUnitPrice = '';
  @tracked formUnitSqFt = '';
  @tracked formUnitBedrooms = '';
  @tracked formUnitBathrooms = '';
  @tracked formUnitOwnerId = '';
  @tracked formUnitAmenities = [];
  @tracked isSavingUnit = false;
  @tracked unitError = '';

  get amenityOptions() { return AMENITY_OPTIONS; }

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action toggleAmenity(key) {
    this.formUnitAmenities = toggleArrayItem(this.formUnitAmenities, key);
  }

  @action openCreateAsset() {
    this.formAssetName = '';
    this.formAssetAddress = '';
    this.editAsset = null;
    this.assetError = '';

    const firstAsset = this.model?.assets?.[0];
    if (firstAsset?.locality?.city) {
      this.selectedCity = firstAsset.locality.city;
      this.selectedLocality = firstAsset.locality;
    } else if (firstAsset?.locality) {
      this.selectedCity = null;
      this.selectedLocality = firstAsset.locality;
    } else {
      this.selectedCity = null;
      this.selectedLocality = null;
    }
    this.showAssetModal = true;
  }

  @action openEditAsset(asset) {
    this.formAssetName = asset.name;
    this.formAssetAddress = asset.address ?? '';
    this.editAsset = asset;
    this.assetError = '';
    this.showAssetModal = true;
  }

  @action closeAssetModal() {
    this.showAssetModal = false;
    this.editAsset = null;
    this.assetError = '';
  }

  @action async saveAsset(event) {
    event.preventDefault();
    if (this.isSavingAsset) return;

    const isEdit = !!this.editAsset;
    if (!isEdit && !this.selectedLocality) {
      this.assetError = 'Please select a city and locality first.';
      return;
    }

    this.isSavingAsset = true;
    this.assetError = '';

    const path = isEdit
      ? `/properties/assets/${this.editAsset.id}`
      : '/properties/assets';

    const body = {
      name: this.formAssetName,
      ...(!isEdit ? { localityId: this.selectedLocality.id } : {}),
      ...(this.formAssetAddress ? { address: this.formAssetAddress } : {}),
    };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Asset updated' : 'Asset created');
      this.closeAssetModal();
      this.router.refresh('properties.detail');
    } catch (e) {
      this.assetError = e.message;
    } finally {
      this.isSavingAsset = false;
    }
  }

  @action openCreateUnit(assetId) {
    this.activeAssetId = assetId;
    this.formUnitNumber = '';
    this.formUnitStatus = 'available';
    this.formUnitPropertyType = '';
    this.formUnitPrice = '';
    this.formUnitSqFt = '';
    this.formUnitBedrooms = '';
    this.formUnitBathrooms = '';
    this.formUnitOwnerId = '';
    this.formUnitAmenities = [];
    this.editUnit = null;
    this.unitError = '';
    this.showUnitModal = true;
  }

  @action openEditUnit(unit, assetId) {
    this.activeAssetId = assetId;
    this.formUnitNumber = unit.unitNumber;
    this.formUnitStatus = unit.status ?? 'available';
    this.formUnitPropertyType = unit.propertyType ?? '';
    this.formUnitPrice = unit.price ? String(unit.price) : '';
    this.formUnitSqFt = unit.sqFt ? String(unit.sqFt) : '';
    this.formUnitBedrooms = unit.bedrooms != null ? String(unit.bedrooms) : '';
    this.formUnitBathrooms = unit.bathrooms != null ? String(unit.bathrooms) : '';
    this.formUnitOwnerId = unit.ownerId || '';
    this.formUnitAmenities = Array.isArray(unit.amenities) ? [...unit.amenities] : [];
    this.editUnit = unit;
    this.unitError = '';
    this.showUnitModal = true;
  }

  @action closeUnitModal() {
    this.showUnitModal = false;
    this.editUnit = null;
    this.unitError = '';
  }

  @action async saveUnit(event) {
    event.preventDefault();
    if (this.isSavingUnit) return;
    this.isSavingUnit = true;
    this.unitError = '';

    const isEdit = !!this.editUnit;
    const path = isEdit
      ? `/properties/units/${this.editUnit.id}`
      : '/properties/units';

    const body = {
      unitNumber: this.formUnitNumber,
      status: this.formUnitStatus,
      ...(!isEdit ? { assetId: this.activeAssetId } : {}),
      ...(this.formUnitPropertyType ? { propertyType: this.formUnitPropertyType } : (isEdit ? { propertyType: null } : {})),
      ...(this.formUnitPrice ? { price: parseFloat(this.formUnitPrice) } : {}),
      ...(this.formUnitSqFt ? { sqFt: parseFloat(this.formUnitSqFt) } : {}),
      ...(this.formUnitBedrooms ? { bedrooms: parseInt(this.formUnitBedrooms, 10) } : {}),
      ...(this.formUnitBathrooms ? { bathrooms: parseInt(this.formUnitBathrooms, 10) } : {}),
      ...(this.formUnitOwnerId ? { ownerId: this.formUnitOwnerId } : {}),
      amenities: this.formUnitAmenities,
    };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Unit updated' : 'Unit created');
      this.closeUnitModal();
      this.router.refresh('properties.detail');
    } catch (e) {
      this.unitError = e.message;
    } finally {
      this.isSavingUnit = false;
    }
  }
}
