import Component from '@glimmer/component';
import { action } from '@ember/object';
import { SIZE_MAP } from './-constants';

// success, warning and info have no kit equivalent.
const VARIANT_CLASSES = {
  brand: 'brand',
  danger: 'danger',
  secondary: 'subtle',
  ghost: 'quiet',
  link: 'link',
};
const SHAPE_CLASSES = { circle: 'icon round', square: 'icon' };

export default class WovenButtonComponent extends Component {
  get classes() {
    const parts = new Set(['wu-btn']);
    const variant = VARIANT_CLASSES[this.args.variant];
    const size = SIZE_MAP[this.args.size];
    const shape = SHAPE_CLASSES[this.args.shape];

    if (variant) parts.add(variant);
    if (size) parts.add(size);
    if (shape) parts.add(shape);
    if (this.args.subtle) parts.add('subtle');
    if (this.args.block) parts.add('w-full');

    return [...parts].join(' ');
  }

  // Undefined when @active is not passed, so plain buttons carry no toggle state; buttons only.
  get ariaPressed() {
    if (this.args.active === undefined) return undefined;
    return this.args.active ? 'true' : 'false';
  }

  get ariaBusy() {
    return this.args.loading ? 'true' : undefined;
  }

  // Anchors cannot be disabled natively; aria-disabled carries the state.
  get ariaDisabled() {
    return this.isDisabled ? 'true' : undefined;
  }

  get isDisabled() {
    return Boolean(this.args.disabled || this.args.loading);
  }

  get iconName() {
    return this.args.icon;
  }

  get isLoading() {
    return Boolean(this.args.loading);
  }

  get hasIcon() {
    return Boolean(this.iconName) || this.isLoading;
  }

  // Lowercase kebab reads as a Phosphor name; anything else is a literal glyph.
  get isPhosphorIcon() {
    return /^[a-z0-9-]+$/.test(this.iconName ?? '');
  }

  get iconAtEnd() {
    return this.args.iconPosition === 'end' && !this.args.loading;
  }

  get iconAtStart() {
    return this.hasIcon && !this.iconAtEnd;
  }

  get isIconOnly() {
    return Boolean(SHAPE_CLASSES[this.args.shape]);
  }

  get type() {
    return this.args.type || 'button';
  }

  get linkModels() {
    if (this.args.models) return this.args.models;
    return this.args.model === undefined ? [] : [this.args.model];
  }

  get linkQuery() {
    return this.args.query ?? {};
  }

  @action
  onClick(event) {
    if (this.isDisabled) {
      return;
    }
    this.args.onClick?.(event);
  }

  // A link has no native disabled state, so a disabled anchor cancels its own navigation.
  @action
  onLinkClick(event) {
    if (this.isDisabled) {
      event.preventDefault();
    }
  }
}
