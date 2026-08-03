import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';

const POSITIONS = ['top-start', 'top-end', 'bottom-start', 'bottom-end'];

// The service speaks in outcomes, the kit speaks in variants. `error` is the
// only name that differs.
const VARIANTS = {
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'info',
};

export default class NuToastRegionComponent extends Component {
  @service notifications;

  get classes() {
    const parts = ['nu-toast-region'];

    if (POSITIONS.includes(this.args.position)) {
      parts.push(`m-${this.args.position}`);
    }

    return parts.join(' ');
  }

  get toasts() {
    return this.notifications.toasts.map((toast) => ({
      ...toast,
      classes: `nu-toast m-${VARIANTS[toast.type] || 'info'}`,
    }));
  }

  @action
  dismiss(id) {
    this.notifications.remove(id);
  }
}
