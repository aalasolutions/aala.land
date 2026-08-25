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

  // Dropdown options tagged with a country `group`, sorted country then region
  // so Nuvo::Dropdown renders one header per country. Matches the topbar
  // switcher grouping in application.js `groupedRegions`.
  get regionOptions() {
    return this.regions
      .map((r) => ({
        value: r.code,
        label: `${r.name} (${r.currency})`,
        group: r.countryName || r.country || 'Other',
      }))
      .sort(
        (a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label),
      );
  }

  initialize(regions, defaultRegionCode) {
    // Sorted once at the source so every consumer (topbar switcher, team
    // assignment picker, lead and vendor forms) reads the same order.
    this.regions = [...(regions ?? [])].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
    );

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
