import Component from '@glimmer/component';
import { VARIANTS } from './-constants';

export default class WovenBadgeComponent extends Component {
  get role() {
    return VARIANTS.includes(this.args.variant) ? this.args.variant : null;
  }

  get countRole() {
    return this.args.variant === undefined ? 'danger' : this.role;
  }

  get classes() {
    const parts = ['wu-badge'];

    if (this.role) {
      parts.push(this.role);
    }
    if (this.args.solid) {
      parts.push('solid');
    }

    return parts.join(' ');
  }

  get dotClasses() {
    return this.role ? `wu-dot ${this.role}` : 'wu-dot';
  }

  // Count bubble has no block content to anchor a pill badge to.
  get isCount() {
    return Boolean(this.args.count);
  }

  get countClasses() {
    const parts = this.args.isDot ? ['wu-dot'] : ['wu-badge', 'solid'];

    if (this.countRole) {
      parts.push(this.countRole);
    }

    return parts.join(' ');
  }

  get cornerClasses() {
    return `${this.countClasses} corner`;
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
