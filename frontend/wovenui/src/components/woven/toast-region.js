import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';

const POSITIONS = ['top-start', 'top-end', 'bottom-start'];

// Service speaks in outcomes, kit speaks in variants; `error` is the only name that differs.
const VARIANTS = {
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'info',
};

export default class WovenToastRegionComponent extends Component {
  @service notifications;

  get classes() {
    const parts = ['wu-toast-region'];

    // bottom-end is the kit default, so it has no class.
    if (POSITIONS.includes(this.args.position)) {
      parts.push(this.args.position);
    }

    return parts.join(' ');
  }

  get toasts() {
    return this.notifications.toasts.map((toast) => ({
      ...toast,
      classes: `wu-toast ${VARIANTS[toast.type] || 'info'}`,
    }));
  }

  @action
  dismiss(id) {
    this.notifications.remove(id);
  }
}
