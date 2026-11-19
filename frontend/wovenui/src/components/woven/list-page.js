import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';

export default class WovenListPageComponent extends Component {
  @tracked optionsHost = null;

  // The body's table renders its Options trigger into this element.
  registerOptionsHost = modifier((element) => {
    this.optionsHost = element;
    return () => {
      if (this.optionsHost === element) this.optionsHost = null;
    };
  });

  get formatter() {
    return new Intl.NumberFormat(this.args.locale || navigator.language);
  }

  get showsTotal() {
    const { total, count, filtered } = this.args;
    if (total === null || total === undefined) return false;
    return Number(total) !== Number(count) || Boolean(filtered);
  }

  nounFor(value) {
    return value === 1 ? this.args.noun : this.args.nounPlural;
  }

  get countText() {
    const count = Number(this.args.count) || 0;
    const format = (value) => this.formatter.format(value);
    if (this.showsTotal) {
      const total = Number(this.args.total) || 0;
      return `${format(count)} of ${format(total)} ${this.nounFor(total)}`;
    }
    return `${format(count)} ${this.nounFor(count)}`;
  }
}
