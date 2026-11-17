import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class WovenSidebarLinkComponent extends Component {
  @action
  onClick(event) {
    this.args.onClick?.(event);
  }
}
