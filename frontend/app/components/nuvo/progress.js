import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['sm', 'lg'];

export default class NuProgressComponent extends Component {
  get classes() {
    const parts = ['nu-progress'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.indeterminate) {
      parts.push('m-indeterminate');
    }
    if (this.args.striped) {
      parts.push('m-striped');
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

  get barStyle() {
    return htmlSafe(`inline-size: ${this.value}%`);
  }

  get showText() {
    return Boolean(this.args.showText);
  }

  get displayLabel() {
    return this.args.label ?? `${this.value}%`;
  }
}
