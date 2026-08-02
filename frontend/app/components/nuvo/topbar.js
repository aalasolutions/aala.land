import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class NuTopbarComponent extends Component {
  get classes() {
    const parts = ['nu-topbar'];
    if (this.args.sticky) {
      parts.push('m-sticky');
    }
    return parts.join(' ');
  }

  @action
  toggle() {
    this.args.onToggle?.();
  }
}
