import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { SIZE_MAP } from './-constants';

// Ring roles the kit supports; brand is the default ring. strokeWidth has no kit equivalent.
const ROLES = ['success', 'danger', 'warning', 'info'];

export default class WovenProgressCircleComponent extends Component {
  get classes() {
    const parts = ['wu-progress-circle'];
    const size = SIZE_MAP[this.args.size];

    if (ROLES.includes(this.args.variant)) {
      parts.push(this.args.variant);
    }
    if (size) {
      parts.push(size);
    }

    return parts.join(' ');
  }

  get value() {
    const raw = Number(this.args.value);
    if (Number.isNaN(raw)) {
      return 0;
    }
    return Math.min(100, Math.max(0, raw));
  }

  get style() {
    return htmlSafe(`--wu-progress-circle--Value: ${this.value}`);
  }

  get showText() {
    return Boolean(this.args.showText);
  }

  get displayLabel() {
    return `${this.value}%`;
  }
}
