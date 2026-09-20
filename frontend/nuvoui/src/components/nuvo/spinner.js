import Component from '@glimmer/component';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['xs', 'sm', 'md', 'lg'];

export default class NuSpinnerComponent extends Component {
  get classes() {
    const parts = ['nu-spinner'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }

    return parts.join(' ');
  }
}
