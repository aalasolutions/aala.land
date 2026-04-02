import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class RegionService extends Service {
  @tracked activeRegion = null;
  @tracked regions = [];

  get currencyCode() {
    return this.activeRegion?.currency ?? null;
  }

  get currencySymbol() {
    return this.activeRegion?.currencySymbol ?? null;
  }

  get regionCode() {
    return this.activeRegion?.code ?? null;
  }

  initialize(regions, defaultRegionCode) {
    this.regions = regions || [];

    const saved = localStorage.getItem('aala-region');
    if (saved && this.regions.find((r) => r.code === saved)) {
      this.activeRegion = this.regions.find((r) => r.code === saved);
    } else {
      this.activeRegion =
        this.regions.find((r) => r.code === defaultRegionCode) ||
        this.regions[0] ||
        null;
    }
  }

  switchRegion(region) {
    this.activeRegion = region;
    localStorage.setItem('aala-region', region.code);
  }

  clear() {
    this.activeRegion = null;
    this.regions = [];
    localStorage.removeItem('aala-region');
  }
}
