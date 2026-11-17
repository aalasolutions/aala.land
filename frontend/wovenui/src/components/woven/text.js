import Component from '@glimmer/component';

// md is the kit default size; xs and xl fall back to core font-size utilities.
const SIZES = Object.freeze({ xs: 'text-xs', sm: 'sm', lg: 'lg', xl: 'text-xl' });
const VARIANTS = Object.freeze({
  brand: 'text-brand',
  secondary: 'text-gray',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
});
const WEIGHTS = ['normal', 'medium', 'semibold', 'bold'];
const CLAMPS = ['2', '3'];
const TAGS = ['p', 'span'];

export default class WovenTextComponent extends Component {
  get classes() {
    const parts = ['wu-text'];
    const size = SIZES[this.args.size];
    const variant = VARIANTS[this.args.variant];

    if (size) {
      parts.push(size);
    }
    if (this.args.muted) {
      parts.push('muted');
    }
    if (this.args.subtle) {
      parts.push('text-subtle');
    }
    if (variant) {
      parts.push(variant);
    }
    if (WEIGHTS.includes(this.args.weight)) {
      parts.push(`font-${this.args.weight}`);
    }
    if (this.args.truncate) {
      parts.push('truncate');
    }
    if (CLAMPS.includes(String(this.args.clamp))) {
      parts.push(`truncate-${this.args.clamp}`);
    }

    return parts.join(' ');
  }

  get tag() {
    return TAGS.includes(this.args.tag) ? this.args.tag : 'p';
  }
}
