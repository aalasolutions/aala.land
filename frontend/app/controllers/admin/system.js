import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { minorUnitDigits, toMajorUnits, toMinorUnits } from 'land/utils/money';

const COLUMNS = [
  { name: 'Price', valuePath: 'label', width: 240, isFixed: 'left' },
  { name: 'Countries', valuePath: 'countries', width: 180 },
  { name: 'Amount', valuePath: 'unitAmount', width: 140, numeric: true },
  { name: 'Tax', valuePath: 'tax', width: 170 },
  { name: 'Status', valuePath: 'status', width: 260 },
  {
    name: 'Actions',
    valuePath: 'id',
    width: 240,
    isFixed: 'right',
    isSortable: false,
    isResizable: false,
  },
];
const COLUMNS_WITHOUT_TAX = COLUMNS.filter((c) => c.valuePath !== 'tax');

export default class AdminSystemController extends Controller {
  @service auth;
  @service notifications;

  @tracked health = null;
  @tracked fixing = false;

  @tracked addOpen = false;
  @tracked addKind = 'SEAT';
  @tracked addCurrency = 'usd';
  @tracked addAmount = '';
  @tracked addCountries = '';
  @tracked addTaxInclusive = true;
  @tracked amountRow = null;
  @tracked newAmount = '';
  @tracked newTaxInclusive = true;
  @tracked deactivateRow = null;
  @tracked priceError = '';
  @tracked priceBusy = false;

  kindOptions = [
    { value: 'SEAT', label: 'Seat' },
    { value: 'ENTERPRISE_BASE', label: 'Enterprise base' },
  ];

  get data() {
    return this.health ?? this.model;
  }

  // The tax setting is shown only when the provider uses it.
  get showTax() {
    return this.data?.supportsTaxMode === true;
  }

  get columns() {
    return this.showTax ? COLUMNS : COLUMNS_WITHOUT_TAX;
  }

  get showNewTax() {
    return this.showTax && this.amountRow?.isBase;
  }

  get rows() {
    return (this.data?.rows ?? []).map((row) => {
      const isBase = !row.countryCodes?.length;
      return {
        ...row,
        isBase,
        label: `${row.kind} / ${(row.currency || '').toUpperCase()}`,
        countries: isBase ? '-' : row.countryCodes.join(', '),
        tax: this.taxLabel(row, isBase),
      };
    });
  }

  // A custom price rides its base price, so it has no tax setting of its own.
  taxLabel(row, isBase) {
    if (!isBase) return 'As base price';
    return row.taxInclusive === false ? 'Added on top' : 'Included';
  }

  get addIsBase() {
    return !(this.addCountries || '').trim();
  }

  get overallState() {
    const d = this.data;
    if (!d) return 'unknown';
    if (d.failed > 0) return 'failed';
    if (d.pending > 0) return 'pending';
    if (d.missing > 0) return 'missing';
    return 'ok';
  }

  get healthBadge() {
    switch (this.overallState) {
      case 'ok':
        return {
          cls: 'tag-sub-active',
          text: `OK, ${this.data.registered} of ${this.data.total} active`,
        };
      case 'pending':
        return {
          cls: 'tag-sub-incomplete',
          text: `${this.data.pending} pending`,
        };
      case 'missing':
        return {
          cls: 'tag-sub-incomplete',
          text: `${this.data.missing} missing`,
        };
      case 'failed':
        return { cls: 'tag-sub-unpaid', text: 'Sync failed' };
      default:
        return { cls: 'tag-sub-incomplete', text: 'Unknown' };
    }
  }

  get needsFix() {
    return this.overallState !== 'ok';
  }

  @action
  async fix() {
    if (this.fixing) return;
    this.fixing = true;
    try {
      await this.auth.fetchJson('/billing/prices/sync', { method: 'POST' });
      const res = await this.auth.fetchJson('/console/system/price-health');
      this.health = res?.data ?? this.health;
      this.notifications.success('Price sync run');
    } catch (e) {
      this.notifications.error(e.message || 'Sync failed');
    } finally {
      this.fixing = false;
    }
  }

  @action
  openAdd() {
    this.addKind = 'SEAT';
    this.addCurrency = 'usd';
    this.addAmount = '';
    this.addCountries = '';
    this.addTaxInclusive = true;
    this.priceError = '';
    this.addOpen = true;
  }

  @action
  openAmount(row) {
    this.amountRow = row;
    this.newAmount = String(toMajorUnits(row.unitAmount, row.currency));
    this.newTaxInclusive = row.taxInclusive !== false;
    this.priceError = '';
  }

  @action
  setTaxInclusive(field, checked) {
    this[field] = checked;
  }

  @action
  openDeactivate(row) {
    this.deactivateRow = row;
    this.priceError = '';
  }

  @action
  closePriceModal() {
    if (this.priceBusy) return;
    this.addOpen = false;
    this.amountRow = null;
    this.deactivateRow = null;
  }

  @action
  setPriceField(field, event) {
    this[field] = event.target.value;
  }

  @action
  setAddKind(value) {
    this.addKind = value;
  }

  @action
  submitAdd() {
    const currency = (this.addCurrency || '').trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) {
      this.priceError = 'Currency must be a 3-letter code.';
      return;
    }
    const amountError = this.amountError(this.addAmount, currency);
    if (amountError) {
      this.priceError = amountError;
      return;
    }
    const unitAmount = toMinorUnits(this.addAmount, currency);
    const countryCodes = (this.addCountries || '')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (countryCodes.some((c) => !/^[A-Z]{2}$/.test(c))) {
      this.priceError = 'Countries must be 2-letter codes, comma separated.';
      return;
    }
    const body = { kind: this.addKind, currency, unitAmount };
    if (countryCodes.length) body.countryCodes = countryCodes;
    else body.taxInclusive = this.addTaxInclusive;
    return this.writePrice('/console/prices', body, 'Price added');
  }

  @action
  submitAmount() {
    const row = this.amountRow;
    if (!row) return;
    const amountError = this.amountError(this.newAmount, row.currency);
    if (amountError) {
      this.priceError = amountError;
      return;
    }
    const body = { unitAmount: toMinorUnits(this.newAmount, row.currency) };
    if (!row.countryCodes?.length) body.taxInclusive = this.newTaxInclusive;
    return this.writePrice(
      `/console/prices/${row.id}/amount`,
      body,
      'Price changed',
    );
  }

  /** Why a typed price amount is refused; null when it is valid. */
  amountError(major, currency) {
    if (major === '' || major === null || major === undefined) {
      return 'Enter an amount.';
    }
    const amount = Number(major);
    if (!Number.isFinite(amount)) return 'The amount must be a number.';
    if (amount < 1) return 'Enter an amount of 1 or more.';
    if (toMinorUnits(major, currency) === null) {
      const digits = minorUnitDigits(currency);
      const code = currency.toUpperCase();
      return digits
        ? `${code} amounts take at most ${digits} decimal places.`
        : `${code} amounts take no decimal places.`;
    }
    return null;
  }

  @action
  submitDeactivate() {
    const row = this.deactivateRow;
    if (!row) return;
    return this.writePrice(
      `/console/prices/${row.id}/deactivate`,
      null,
      'Price deactivated',
    );
  }

  async writePrice(path, body, successMessage) {
    if (this.priceBusy) return;
    this.priceBusy = true;
    this.priceError = '';
    try {
      const res = await this.auth.fetchJson(path, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      this.health = res?.data ?? this.health;
      this.addOpen = false;
      this.amountRow = null;
      this.deactivateRow = null;
      this.notifications.success(successMessage);
    } catch (e) {
      this.priceError = e.message || 'Could not save the price';
    } finally {
      this.priceBusy = false;
    }
  }
}
