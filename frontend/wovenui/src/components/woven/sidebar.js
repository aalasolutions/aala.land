import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class NuSidebarComponent extends Component {
  @action
  dismiss() {
    this.args.onDismiss?.();
  }

  get classes() {
    const parts = ['wu-sidebar'];
    if (this.args.collapsed) {
      parts.push('is-collapsed');
    }
    if (this.args.open) {
      parts.push('is-open');
    }
    return parts.join(' ');
  }

  get backdropClasses() {
    return this.args.open
      ? 'wu-sidebar-backdrop'
      : 'wu-sidebar-backdrop is-hidden';
  }
}
