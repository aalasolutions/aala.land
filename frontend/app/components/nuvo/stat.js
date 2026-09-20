import Component from '@glimmer/component';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['sm', 'lg'];

export default class NuStatComponent extends Component {
  get classes() {
    const parts = ['nu-stat'];
    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.row) {
      parts.push('m-row');
    }
    return parts.join(' ');
  }

  get linkModels() {
    if (this.args.models) return this.args.models;
    return this.args.model === undefined ? [] : [this.args.model];
  }

  get linkQuery() {
    return this.args.query ?? {};
  }
}
