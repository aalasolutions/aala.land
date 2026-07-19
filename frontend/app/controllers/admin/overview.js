import Controller from '@ember/controller';
import { htmlSafe } from '@ember/template';

/** Region codes seen most often; a friendlier label than the raw code. */
const REGION_LABELS = {
  'ae-du': 'Dubai',
  'ae-az': 'Abu Dhabi',
  'ae-sh': 'Sharjah',
  'sa-ri': 'Riyadh',
  'sa-je': 'Jeddah',
  'pk-524': 'Pakistan',
  unknown: 'Unknown',
};

export default class AdminOverviewController extends Controller {
  get overview() {
    return this.model.overview;
  }

  get mrrCurrencies() {
    return this.overview?.mrr ?? [];
  }

  /** Largest currency band drives the headline; chips carry the rest. */
  get dominant() {
    return this.mrrCurrencies[0] ?? null;
  }

  get hasRevenue() {
    return this.mrrCurrencies.length > 0;
  }

  /** ARR = MRR x 12, no independent calculation (design 2.1). */
  get dominantArrMinor() {
    return this.dominant ? this.dominant.mrrMinor * 12 : 0;
  }

  /** Chips collapse to nothing when only one currency has revenue. */
  get showCurrencyChips() {
    return this.mrrCurrencies.length > 1;
  }

  /**
   * Extensible tile grid (ruling 14): each metric is one entry rendered by a
   * single loop, so a new metric is a new entry and never a relayout.
   */
  get tiles() {
    const o = this.overview;
    if (!o) return [];
    return [
      {
        key: 'customers',
        label: 'Customers',
        icon: 'buildings',
        accent: 'kpi-primary',
        iconAccent: 'kpi-icon-primary',
        value: this.formatNumber(o.customers),
      },
      {
        key: 'paying',
        label: 'Paying',
        icon: 'currency-circle-dollar',
        accent: 'kpi-success',
        iconAccent: 'kpi-icon-success',
        value: this.formatNumber(o.payingCustomers),
      },
      {
        key: 'disk',
        label: 'Disk used',
        icon: 'hard-drives',
        accent: 'kpi-coral',
        iconAccent: 'kpi-icon-coral',
        value: this.formatBytes(o.totalStorageBytes),
      },
      {
        key: 'ai-calls',
        label: 'AI calls (this week)',
        icon: 'sparkle',
        accent: 'kpi-warning',
        iconAccent: 'kpi-icon-warning',
        value: this.formatNumber(o.aiCallsCurrentWeek),
      },
      {
        key: 'whatsapps',
        label: 'WhatsApps running',
        icon: 'whatsapp-logo',
        accent: 'kpi-primary',
        iconAccent: 'kpi-icon-primary',
        value: this.formatNumber(o.whatsappsRunning),
      },
    ];
  }

  get regions() {
    const rows = this.overview?.regions ?? [];
    const max = rows.reduce((m, r) => Math.max(m, r.customers), 0) || 1;
    return rows.map((r) => ({
      regionCode: r.regionCode,
      label: REGION_LABELS[r.regionCode] ?? r.regionCode,
      customers: r.customers,
      barStyle: htmlSafe(`width: ${Math.round((r.customers / max) * 100)}%`),
    }));
  }

  get upcomingRows() {
    return this.model.upcoming?.rows ?? [];
  }

  get upcomingDays() {
    return this.model.upcoming?.days ?? 14;
  }

  formatNumber(value) {
    const num = Number(value ?? 0);
    return num.toLocaleString(navigator.language || 'en');
  }

  formatBytes(bytes) {
    const num = Number(bytes ?? 0);
    if (num === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exp = Math.min(
      Math.floor(Math.log(num) / Math.log(1024)),
      units.length - 1,
    );
    const value = num / 1024 ** exp;
    const digits = value >= 100 || exp === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[exp]}`;
  }
}
