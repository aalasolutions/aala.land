import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';

/**
 * Phosphor Icon Component (Webfont version)
 *
 * Usage:
 *   <Ph @icon="phone" />
 *   <Ph @icon="envelope" @size="24" />
 *   <Ph @icon="house" @size="32" @color="#ff0000" />
 *
 * @param {string} icon - Icon name (e.g., "phone", "envelope", "house")
 * @param {string} size - Font size (default: "1em" or specified value like "24px")
 * @param {string} color - Icon color (default: "currentColor")
 */
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
