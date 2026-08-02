import Component from '@glimmer/component';

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'];
const WEIGHTS = ['normal', 'medium', 'semibold', 'bold'];
const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const CLAMPS = ['2', '3'];
const TAGS = ['p', 'span'];

export default class NuTextComponent extends Component {
  get classes() {
    const parts = ['nu-text'];

    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (WEIGHTS.includes(this.args.weight)) {
      parts.push(`m-${this.args.weight}`);
    }
    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (this.args.muted) {
      parts.push('m-muted');
    }
    if (this.args.subtle) {
      parts.push('m-subtle');
    }
    if (this.args.truncate) {
      parts.push('m-truncate');
    }
    if (CLAMPS.includes(String(this.args.clamp))) {
      parts.push(`m-clamp-${this.args.clamp}`);
    }

    return parts.join(' ');
  }

  get tag() {
    return TAGS.includes(this.args.tag) ? this.args.tag : 'p';
  }
}
