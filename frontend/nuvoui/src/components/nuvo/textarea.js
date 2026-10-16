import Component from '@glimmer/component';
import { action } from '@ember/object';
import { htmlSafe } from '@ember/template';

const RESIZE = ['none', 'both', 'horizontal', 'vertical'];
const SIZES = ['xs', 'sm', 'lg'];

export default class NuTextareaComponent extends Component {
  get classes() {
    const parts = ['nu-input', 'nu-textarea'];
    if (SIZES.includes(this.args.size)) {
      parts.push(`m-${this.args.size}`);
    }
    if (this.args.invalid) {
      parts.push('is-invalid');
    }
    return parts.join(' ');
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
