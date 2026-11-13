import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class WovenSidebarComponent extends Component {
  @action
  dismiss() {
    this.args.onDismiss?.();
  }

  get classes() {
    const parts = ['wu-sidebar'];
    if (this.args.collapsed) {
      parts.push('collapsed');
    }
    if (this.args.pinned) {
      parts.push('pinned');
    }
    if (this.args.animated) {
      parts.push('animated');
    }
    return parts.join(' ');
  }
}
