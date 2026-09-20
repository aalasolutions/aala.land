import Component from '@glimmer/component';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['xs', 'sm', 'md', 'lg'];

export default class NuDotComponent extends Component {
  get classes() {
    const parts = ['nu-dot'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.pulse) {
      parts.push('m-pulse');
    }
    if (this.args.ring) {
      parts.push('m-ring');
    }

    return parts.join(' ');
  }
}
