import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';

const DIRECTIONAL = /(^|-)(left|right)(-|$)/;

// @icon (name), @size (default "1em"), @color (default "currentColor"), @flip (mirror in RTL).
export default class PhIconComponent extends Component {
  get size() {
    return this.args.size || '1em';
  }

  get color() {
    return this.args.color || 'currentColor';
  }

  get style() {
    return htmlSafe(`font-size: ${this.size}; color: ${this.color};`);
  }

  // Icons named left/right point along the reading direction; `@flip` overrides.
  get flips() {
    return this.args.flip ?? DIRECTIONAL.test(this.args.icon ?? '');
  }

  get iconClass() {
    const base = `ph ph-${this.args.icon}`;
    return this.flips ? `${base} flip-rtl` : base;
  }
}
