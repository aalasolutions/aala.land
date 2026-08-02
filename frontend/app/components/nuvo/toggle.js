import Component from '@glimmer/component';
import { action } from '@ember/object';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['sm', 'lg'];

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

  get hasText() {
    return Boolean(this.args.activeText || this.args.inactiveText);
  }

  @action
  handleChange(event) {
    this.args.onChange?.(event.target.checked, event);
  }
}
