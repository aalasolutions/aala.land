import Component from '@glimmer/component';
import { action } from '@ember/object';
import { resolveStatus, statusClass } from './-field-status.js';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['xs', 'sm', 'lg'];

export default class NuToggleComponent extends Component {
  get classes() {
    const parts = ['nu-toggle'];
    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.hasText) {
      parts.push('m-with-text');
    }
    if (this.args.disabled) {
      parts.push('is-disabled');
    }
    return parts.join(' ');
  }

  get inputClasses() {
    return ['nu-toggle__input', statusClass(this.status)]
      .filter(Boolean)
      .join(' ');
  }

  get status() {
    return resolveStatus(this.args);
  }

  get isInvalid() {
    return this.status === 'error';
  }

  get hasText() {
    return Boolean(this.args.activeText || this.args.inactiveText);
  }

  @action
  handleChange(event) {
    this.args.onChange?.(event.target.checked, event);
  }
}
