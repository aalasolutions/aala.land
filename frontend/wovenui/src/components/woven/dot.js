import Component from '@glimmer/component';
import { VARIANTS } from './-constants';

export default class WovenDotComponent extends Component {
  get classes() {
    const parts = ['wu-dot'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(this.args.variant);
    }
    if (this.args.pulse) {
      parts.push('animated');
    }

    return parts.join(' ');
  }
}
