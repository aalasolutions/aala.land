import Component from '@glimmer/component';
import { guidFor } from '@ember/object/internals';
import { SIZE_MAP } from './-constants';

// Fill roles the kit supports; brand is the default fill. striped has no kit equivalent.
const ROLES = ['success', 'danger', 'warning', 'info'];

export default class WovenProgressComponent extends Component {
  id = `${guidFor(this)}-progress`;

  get classes() {
    const parts = ['wu-progress'];
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

  get showText() {
    return Boolean(this.args.showText);
  }

  get displayLabel() {
    return this.args.label ?? `${this.value}%`;
  }
}
