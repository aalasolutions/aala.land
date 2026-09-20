import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class NuSidebarLinkComponent extends Component {
  get classes() {
    const parts = [this.args.sub ? 'nu-sidebar__sublink' : 'nu-sidebar__link'];
    if (this.args.active) {
      parts.push('is-active');
    }
    return parts.join(' ');
  }

  @action
  onClick(event) {
    this.args.onClick?.(event);
  }
}
