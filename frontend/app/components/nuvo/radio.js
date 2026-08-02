import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class NuRadioComponent extends Component {
  get classes() {
    return 'nu-check m-radio';
  }

  get labelClasses() {
    const parts = ['nu-check-label'];
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
