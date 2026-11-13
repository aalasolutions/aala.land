import Component from '@glimmer/component';
import { action } from '@ember/object';
import { VARIANTS } from './-constants';

// icon, showIcon, inline and banner have no CSS kit equivalent; the kit draws its own marker.
export default class WovenAlertComponent extends Component {
  get classes() {
    return VARIANTS.includes(this.args.variant) ? `wu-alert ${this.args.variant}` : 'wu-alert';
  }

  @action
  handleClose(event) {
    this.args.onClose?.(event);
  }
}
