import Component from '@glimmer/component';
import { action } from '@ember/object';
import { htmlSafe } from '@ember/template';
import { resolveStatus } from './-field-status.js';

const RESIZE = ['none', 'both', 'horizontal', 'vertical'];

// The CSS kit textarea has no sizes, so `@size` is accepted and ignored.
export default class WovenTextareaComponent extends Component {
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
