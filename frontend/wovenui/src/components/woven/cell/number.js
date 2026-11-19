import Component from '@glimmer/component';

export default class WovenCellNumberComponent extends Component {
  get number() {
    const { value } = this.args;
    if (value === null || value === undefined || value === '') return NaN;
    return Number(value);
  }

  get isEmpty() {
    return !Number.isFinite(this.number);
  }

  get formatted() {
    const locale =
      this.args.locale ||
      this.args.column?.cellArgs?.locale ||
      navigator.language;
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
      this.number,
    );
  }
}
