import Component from '@glimmer/component';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['sm', 'lg'];

export default class NuBadgeComponent extends Component {
  get classes() {
    const parts = ['nu-badge'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.solid) {
      parts.push('m-solid');
    }
    if (this.args.outline) {
      parts.push('m-outline');
    }
    if (this.args.pill) {
      parts.push('m-pill');
    }
    if (this.args.quiet) {
      parts.push('m-quiet');
    }
    if (this.args.isDot) {
      parts.push('m-dot');
    }

    return parts.join(' ');
  }

  // Renders the count bubble on its own instead of the pill badge, since
  // without a block there is nothing to anchor it to.
  get isCount() {
    return Boolean(this.args.count);
  }

  get countClasses() {
    const parts = ['nu-badge-count'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (this.args.isDot) {
      parts.push('m-dot');
    }

    return parts.join(' ');
  }

  // @text is an alias for @value. Both read naturally depending on whether the
  // badge is a count or a label, and callers reach for either.
  get resolvedValue() {
    return this.args.value !== undefined && this.args.value !== null
      ? this.args.value
      : this.args.text;
  }

  get hasValue() {
    const value = this.resolvedValue;
    return value !== undefined && value !== null;
  }

  // A dot badge carries no value, so it must not be hidden for lacking one.
  get isHidden() {
    return Boolean(this.args.hidden) || (!this.hasValue && !this.args.isDot);
  }

  get displayValue() {
    const value = this.resolvedValue;
    const max = this.args.max;
    const numericValue = Number(value);
    const numericMax = Number(max);
    if (Number.isFinite(numericValue) && Number.isFinite(numericMax) && numericValue > numericMax) {
      return `${numericMax}+`;
    }
    return value;
  }
}
