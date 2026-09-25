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

  // Count bubble has no block content to anchor a pill badge to.
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

  // @text aliases @value, whichever reads naturally for count vs label.
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

  // Only a number above @max is capped to "N+"; text labels pass through untouched.
  get isOverflow() {
    const numericValue = Number(this.resolvedValue);
    const numericMax = Number(this.args.max);
    return Number.isFinite(numericValue) && Number.isFinite(numericMax) && numericValue > numericMax;
  }

  get displayValue() {
    return this.isOverflow ? `${Number(this.args.max)}+` : this.resolvedValue;
  }
}
