import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';

const VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
const SIZES = ['sm', 'lg'];
const VIEWBOX = 100;
const CENTER = 50;

export default class NuProgressCircleComponent extends Component {
  get classes() {
    const parts = ['nu-progress-circle'];

    if (VARIANTS.includes(this.args.variant)) {
      parts.push(`m-${this.args.variant}`);
    }
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
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

  get strokeWidth() {
    const width = Number(this.args.strokeWidth);
    return Number.isNaN(width) || width <= 0 ? 6 : width;
  }

  get radius() {
    return CENTER - this.strokeWidth / 2;
  }

  get circumference() {
    return 2 * Math.PI * this.radius;
  }

  get dashoffset() {
    return this.circumference * (1 - this.value / 100);
  }

  get viewBox() {
    return `0 0 ${VIEWBOX} ${VIEWBOX}`;
  }

  get trackStyle() {
    return htmlSafe(`stroke-width: ${this.strokeWidth}`);
  }

  get barStyle() {
    return htmlSafe(
      `stroke-width: ${this.strokeWidth}; stroke-dasharray: ${this.circumference}; stroke-dashoffset: ${this.dashoffset}`,
    );
  }

  get showText() {
    return Boolean(this.args.showText);
  }

  get displayLabel() {
    return `${this.value}%`;
  }
}
