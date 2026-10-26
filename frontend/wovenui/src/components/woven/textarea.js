import Component from '@glimmer/component';
import { action } from '@ember/object';
import { htmlSafe } from '@ember/template';
import { resolveStatus, statusClass } from './-field-status.js';

const RESIZE = ['none', 'both', 'horizontal', 'vertical'];
const SIZES = ['xs', 'sm', 'lg'];

export default class NuTextareaComponent extends Component {
  get classes() {
    const parts = ['wu-input', 'wu-textarea'];
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    const status = statusClass(this.status);
    if (status) {
      parts.push(status);
    }
    return parts.join(' ');
  }

  get status() {
    return resolveStatus(this.args);
  }

  get isInvalid() {
    return this.status === 'error';
  }

  get resizeStyle() {
    if (!RESIZE.includes(this.args.resize)) {
      return undefined;
    }
    return htmlSafe(`resize: ${this.args.resize}`);
  }

  @action
  handleInput(event) {
    this.args.onInput?.(event.target.value, event);
  }

  @action
  handleChange(event) {
    this.args.onChange?.(event.target.value, event);
  }
}
