import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';

// @icon (name), @size (default "1em"), @color (default "currentColor").
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

  get iconClass() {
    return `ph ph-${this.args.icon}`;
  }
}
