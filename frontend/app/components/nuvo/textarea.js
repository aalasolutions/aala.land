import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class NuTextareaComponent extends Component {
  get classes() {
    const parts = ['nu-input', 'nu-textarea'];
    if (this.args.invalid) {
      parts.push('is-invalid');
    }
    return parts.join(' ');
  }

  get resizeStyle() {
    return this.args.resize ? `resize: ${this.args.resize};` : undefined;
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
