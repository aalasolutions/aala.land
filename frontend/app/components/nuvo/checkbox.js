import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class NuCheckboxComponent extends Component {
  get classes() {
    const parts = ['nu-check'];
    return parts.join(' ');
  }

  get labelClasses() {
    const parts = ['nu-check-label'];
    if (this.args.disabled) {
      parts.push('is-disabled');
    }
    return parts.join(' ');
  }

  // `indeterminate` is a DOM property, not an attribute - it must be set
  // directly on the element. did-insert/did-update give us that element.
  @action
  syncIndeterminate(element) {
    element.indeterminate = Boolean(this.args.indeterminate);
  }

  @action
  handleChange(event) {
    this.args.onChange?.(event.target.checked, event);
  }
}
