import Component from '@glimmer/component';
import { action } from '@ember/object';
import { resolveStatus, statusClass } from './-field-status.js';

const SIZES = ['xs', 'sm', 'lg'];

export default class NuCheckboxComponent extends Component {
  get sizeClass() {
    return SIZES.includes(this.args.size) ? `m-${this.args.size}` : null;
  }

  get classes() {
    return ['wu-check', this.sizeClass, statusClass(this.status)]
      .filter(Boolean)
      .join(' ');
  }

  get status() {
    return resolveStatus(this.args);
  }

  get isInvalid() {
    return this.status === 'error';
  }

  get labelClasses() {
    const parts = ['wu-check-label'];
    if (this.sizeClass) {
      parts.push(this.sizeClass);
    }
    if (this.args.disabled) {
      parts.push('is-disabled');
    }
    return parts.join(' ');
  }

  // `indeterminate` is a DOM property, not an attribute, so it must be set directly on the element.
  @action
  syncIndeterminate(element) {
    element.indeterminate = Boolean(this.args.indeterminate);
  }

  @action
  handleChange(event) {
    this.args.onChange?.(event.target.checked, event);
  }
}
