import Component from '@glimmer/component';
import { action } from '@ember/object';
import { resolveStatus, statusClass } from './-field-status.js';

const SIZES = ['xs', 'sm', 'lg'];

export default class NuRadioComponent extends Component {
  get sizeClass() {
    return SIZES.includes(this.args.size) ? `m-${this.args.size}` : null;
  }

  get classes() {
    return ['nu-check', 'm-radio', this.sizeClass, statusClass(this.status)]
      .filter(Boolean)
      .join(' ');
  }

  // A radio's invalid and required state belong to its group (ARIA), so `@status`
  // only styles it here; Nuvo::FieldGroup carries the message for the set.
  get status() {
    return resolveStatus(this.args);
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
