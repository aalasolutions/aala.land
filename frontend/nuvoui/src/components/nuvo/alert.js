import Component from '@glimmer/component';
import { action } from '@ember/object';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];

export default class NuAlertComponent extends Component {
  get classes() {
    const parts = ['nu-alert'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (this.args.inline) {
      parts.push('m-inline');
    }
    if (this.args.banner) {
      parts.push('m-banner');
    }
    if (this.args.closable) {
      parts.push('is-dismissible');
    }

    return parts.join(' ');
  }

  get showIcon() {
    return this.args.showIcon !== false && Boolean(this.args.icon);
  }

  get iconClasses() {
    return this.args.description ? 'nu-alert__icon is-large' : 'nu-alert__icon';
  }

  @action
  handleClose(event) {
    this.args.onClose?.(event);
  }
}
