import Component from '@glimmer/component';
import { action } from '@ember/object';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['sm', 'lg'];

export default class NuTagComponent extends Component {
  get classes() {
    const parts = ['nu-tag'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.outline) {
      parts.push('m-outline');
    }
    if (this.args.disabled) {
      parts.push('is-disabled');
    }

    return parts.join(' ');
  }

  @action
  handleClose(event) {
    if (this.args.disabled) {
      return;
    }
    this.args.onClose?.(event);
  }
}
