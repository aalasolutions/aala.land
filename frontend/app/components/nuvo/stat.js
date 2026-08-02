import Component from '@glimmer/component';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];

export default class NuStatComponent extends Component {
  get classes() {
    const parts = ['nu-stat'];
    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    return parts.join(' ');
  }
}
