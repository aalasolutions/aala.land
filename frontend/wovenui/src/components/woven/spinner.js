import Component from '@glimmer/component';
import { SIZE_MAP } from './-constants';

export default class WovenSpinnerComponent extends Component {
  get classes() {
    const size = SIZE_MAP[this.args.size];
    return size ? `wu-spinner ${size}` : 'wu-spinner';
  }
}
