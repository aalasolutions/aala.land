import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class WovenTopbarComponent extends Component {
  @action
  toggle() {
    this.args.onToggle?.();
  }
}
