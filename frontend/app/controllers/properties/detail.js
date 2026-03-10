import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';

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
    const buildings = this.model?.buildings || [];
    const unitIds = [];

    for (const building of buildings) {
      const units = building.units || [];
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

  get buildingsWithHistory() {
    const version = this._historyVersion;
    const buildings = this.model?.buildings || [];

    return buildings.map(building => ({
      ...building,
      units: (building.units || []).map(unit => ({
        ...unit,
        tenantHistory: this.getTenantHistory(unit.id),
      })),
    }));
  }

  // Building modal
  @tracked showBuildingModal = false;
  @tracked editBuilding = null;
  @tracked formBuildingName = '';
  @tracked formBuildingAddress = '';
  @tracked formBuildingPropertyType = 'RENTAL';
  @tracked isSavingBuilding = false;
  @tracked buildingError = '';

  // Unit modal
  @tracked showUnitModal = false;
  @tracked editUnit = null;
  @tracked activeBuildingId = null;
  @tracked activeBuildingPropertyType = 'RENTAL';
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

  amenityOptions = [
    { key: 'free_parking', label: 'Free Parking', icon: 'car' },
    { key: 'paid_parking', label: 'Paid Parking', icon: 'car' },
    { key: 'gym', label: 'Gym', icon: 'barbell' },
    { key: 'pool', label: 'Swimming Pool', icon: 'swimming-pool' },
    { key: 'wifi', label: 'Free WiFi', icon: 'wifi-high' },
    { key: 'security', label: '24/7 Security', icon: 'shield-check' },
    { key: 'cctv', label: 'CCTV', icon: 'security-camera' },
    { key: 'balcony', label: 'Balcony', icon: 'house-line' },
    { key: 'furnished', label: 'Furnished', icon: 'couch' },
    { key: 'central_ac', label: 'Central A/C', icon: 'thermometer-cold' },
    { key: 'concierge', label: 'Concierge', icon: 'bell' },
    { key: 'elevator', label: 'Elevator', icon: 'elevator' },
    { key: 'garden', label: 'Garden', icon: 'plant' },
    { key: 'maid_room', label: "Maid's Room", icon: 'broom' },
    { key: 'storage', label: 'Storage', icon: 'warehouse' },
    { key: 'pet_friendly', label: 'Pet Friendly', icon: 'paw-print' },
    { key: 'kids_play', label: 'Kids Play Area', icon: 'baby' },
    { key: 'bbq', label: 'BBQ Area', icon: 'fire' },
    { key: 'sea_view', label: 'Sea View', icon: 'waves' },
    { key: 'city_view', label: 'City View', icon: 'buildings' },
  ];

  @action setField(fieldName, e) { this[fieldName] = e.target.value; }

  @action toggleAmenity(key) {
    const current = [...this.formUnitAmenities];
    const idx = current.indexOf(key);
    if (idx === -1) {
      current.push(key);
    } else {
      current.splice(idx, 1);
    }
    this.formUnitAmenities = current;
  }

  @action openCreateBuilding() {
    this.formBuildingName = '';
    this.formBuildingAddress = '';
    this.formBuildingPropertyType = 'RENTAL';
    this.editBuilding = null;
    this.buildingError = '';
    this.showBuildingModal = true;
  }

  @action openEditBuilding(building) {
    this.formBuildingName = building.name;
    this.formBuildingAddress = building.address ?? '';
    this.formBuildingPropertyType = building.propertyType ?? 'RENTAL';
    this.editBuilding = building;
    this.buildingError = '';
    this.showBuildingModal = true;
  }

  @action closeBuildingModal() {
    this.showBuildingModal = false;
    this.editBuilding = null;
    this.buildingError = '';
  }

  @action async saveBuilding(event) {
    event.preventDefault();
    if (this.isSavingBuilding) return;
    this.isSavingBuilding = true;
    this.buildingError = '';

    const areaId = this.model.area.id;
    const isEdit = !!this.editBuilding;
    const path = isEdit
      ? `/properties/buildings/${this.editBuilding.id}`
      : '/properties/buildings';

    const body = {
      name: this.formBuildingName,
      ...(!isEdit ? { areaId } : {}),
      propertyType: this.formBuildingPropertyType,
      ...(this.formBuildingAddress ? { address: this.formBuildingAddress } : {}),
    };

    try {
      await this.auth.fetchJson(path, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      this.notifications.success(isEdit ? 'Building updated' : 'Building created');
      this.closeBuildingModal();
      this.router.refresh('properties.detail');
    } catch (e) {
      this.buildingError = e.message;
    } finally {
      this.isSavingBuilding = false;
    }
  }

  @action openCreateUnit(buildingId, buildingPropertyType = 'RENTAL') {
    this.activeBuildingId = buildingId;
    this.activeBuildingPropertyType = buildingPropertyType;
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

  @action openEditUnit(unit, buildingId, buildingPropertyType = 'RENTAL') {
    this.activeBuildingId = buildingId;
    this.activeBuildingPropertyType = buildingPropertyType;
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
      ...(!isEdit ? { buildingId: this.activeBuildingId } : {}),
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
