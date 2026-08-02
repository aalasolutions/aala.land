import Component from '@glimmer/component';
import { action } from '@ember/object';

const VARIANTS = [
  'primary',
  'secondary',
  'success',
  'warning',
  'danger',
  'info',
  'ghost',
  'link',
];
const SIZES = ['xs', 'sm', 'lg'];
const SHAPES = ['square', 'circle'];

export default class NuButtonComponent extends Component {
  get classes() {
    const parts = ['nu-btn'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (SHAPES.includes(this.args.shape)) {
      parts.push(`m-${this.args.shape}`);
    }
    if (this.args.outline) {
      parts.push('m-outline');
    }
    if (this.args.block) {
      parts.push('is-block');
    }
    if (this.args.active) {
      parts.push('is-active');
    }
    if (this.args.loading) {
      parts.push('is-loading');
    }
    if (this.isDisabled) {
      parts.push('is-disabled');
    }

    return parts.join(' ');
  }

  get isDisabled() {
    return Boolean(this.args.disabled || this.args.loading);
  }

  get iconName() {
    return this.args.loading ? this.args.loadingIcon || '↻' : this.args.icon;
  }

  get hasIcon() {
    return Boolean(this.iconName);
  }

  get iconClasses() {
    return this.args.loading ? 'nu-btn__icon is-spinning' : 'nu-btn__icon';
  }

  get iconAtEnd() {
    return this.args.iconPosition === 'end' && !this.args.loading;
  }

  get iconAtStart() {
    return this.hasIcon && !this.iconAtEnd;
  }

  get isIconOnly() {
    return SHAPES.includes(this.args.shape);
  }

  get type() {
    return this.args.type || 'button';
  }

  @action
  onClick(event) {
    if (this.isDisabled) {
      return;
    }
    this.args.onClick?.(event);
  }
}
