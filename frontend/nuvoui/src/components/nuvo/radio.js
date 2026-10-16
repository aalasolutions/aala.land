import Component from '@glimmer/component';
import { action } from '@ember/object';

const SIZES = ['xs', 'sm', 'lg'];

export default class NuRadioComponent extends Component {
  get sizeClass() {
    return SIZES.includes(this.args.size) ? `m-${this.args.size}` : null;
  }

  get classes() {
    return ['nu-check', 'm-radio', this.sizeClass].filter(Boolean).join(' ');
  }

  get labelClasses() {
    const parts = ['nu-check-label'];
    if (this.sizeClass) {
      parts.push(this.sizeClass);
    }
    if (this.args.disabled) {
      parts.push('is-disabled');
    }
    return parts.join(' ');
  }

  @action
  handleChange(event) {
    if (event.target.checked) {
      this.args.onChange?.(this.args.value, event);
    }
  }
}
