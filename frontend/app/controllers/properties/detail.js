import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { formatShortDate } from '../../utils/local-date';
import { contactName } from '../../utils/contact-display';
import { ARCHIVED_FILTER_OPTIONS } from 'land/constants';

export default class PropertiesDetailController extends Controller {
  queryParams = ['archived'];
  @service auth;
  @service router;
  @service preferences;
  @service region;

  @tracked archived = 'exclude';

  archivedFilterOptions = ARCHIVED_FILTER_OPTIONS;

  get archivedFilterValue() {
    return ARCHIVED_FILTER_OPTIONS.some((o) => o.value === this.archived)
      ? this.archived
      : 'exclude';
  }

  @action setArchivedFilter(value) {
    this.archived = value || 'exclude';
  }

  detailViewOptions = [
    { value: 'cards', label: 'Cards', icon: 'squares-four' },
    { value: 'list', label: 'List', icon: 'list' },
  ];

  @tracked detailView = null;

  get currentDetailView() {
    if (this.detailView) return this.detailView;
    return this.preferences.get('properties-detail-view', 'cards');
  }

  @action switchDetailView(view) {
    this.detailView = view;
    this.preferences.set('properties-detail-view', view);
  }

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

    await Promise.all(
      unitIds.map((unitId) => this._loadTenantHistoryForUnit(unitId)),
    );
    this._historyVersion = (this._historyVersion || 0) + 1;
  }

  async _loadTenantHistoryForUnit(unitId) {
    try {
      const result = await this.auth.fetchJson(`/leases/unit/${unitId}`);
      const leases = result.data || [];
      const todayZone = this.region.activeRegion?.timezone;

      const tenantHistory = leases
        .filter(
          (lease) =>
            lease.status === 'EXPIRED' || lease.status === 'TERMINATED',
        )
        .map((lease) => ({
          tenantName: contactName(lease.contact) || 'Unknown tenant',
          startDate: lease.startDate
            ? formatShortDate(lease.startDate, { todayZone })
            : 'N/A',
          endDate: lease.endDate
            ? formatShortDate(lease.endDate, { todayZone })
            : 'Present',
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
    // tracked dependency for the Map cache
    this._historyVersion;
    const assets = this.model?.assets || [];

    return assets.map((asset) => ({
      ...asset,
      units: (asset.units || []).map((unit) => ({
        ...unit,
        tenantHistory: this.getTenantHistory(unit.id),
      })),
    }));
  }

  unitColumns = [
    { name: 'Asset', valuePath: 'assetName', width: 220, isFixed: 'left' },
    { name: 'Property', valuePath: 'unitNumber', width: 160 },
    { name: 'Status', valuePath: 'status', width: 160 },
    { name: 'Type', valuePath: 'propertyType', width: 150 },
    { name: 'Beds', valuePath: 'bedrooms', width: 90, numeric: true },
    { name: 'Baths', valuePath: 'bathrooms', width: 90, numeric: true },
    { name: 'Size', valuePath: 'sqFt', width: 120, numeric: true },
    { name: 'Price', valuePath: 'price', width: 140, numeric: true },
    {
      name: 'Actions',
      valuePath: 'id',
      width: 170,
      isFixed: 'right',
      isSortable: false,
      isResizable: false,
    },
  ];

  // One parent row per asset, its units as tree children.
  get unitRows() {
    return this.assetsWithHistory.map((asset) => ({
      id: asset.id,
      assetId: asset.id,
      assetName: asset.name,
      unitCount: (asset.units ?? []).length,
      children: (asset.units ?? []).map((unit) => ({
        id: unit.id,
        assetId: asset.id,
        unit,
        unitNumber: unit.unitNumber,
        status: unit.status,
        propertyType: unit.propertyType,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        sqFt: unit.sqFt,
        price: unit.price,
        deletedAt: unit.deletedAt,
      })),
    }));
  }

  @tracked showAssetModal = false;
  @tracked editAsset = null;

  // Preselects the city and location of a new asset from the first asset here.
  get defaultLocality() {
    return this.model?.assets?.[0]?.locality ?? null;
  }

  @tracked showUnitModal = false;
  @tracked editUnit = null;
  @tracked activeAssetId = null;

  @action openCreateAsset() {
    this.editAsset = null;
    this.showAssetModal = true;
  }

  @action openEditAsset(asset) {
    this.editAsset = asset;
    this.showAssetModal = true;
  }

  @action closeAssetModal() {
    this.showAssetModal = false;
  }

  @action resetAssetDrawer() {
    this.editAsset = null;
  }

  @action openCreateUnit(assetId) {
    this.activeAssetId = assetId;
    this.editUnit = null;
    this.showUnitModal = true;
  }

  @action openEditUnit(unit, assetId) {
    this.activeAssetId = assetId;
    this.editUnit = unit;
    this.showUnitModal = true;
  }

  @action closeUnitModal() {
    this.showUnitModal = false;
  }

  @action resetUnitDrawer() {
    this.editUnit = null;
  }

  @action refresh() {
    this.router.refresh('properties.detail');
  }
}
