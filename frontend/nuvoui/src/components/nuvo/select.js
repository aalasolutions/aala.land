import Component from '@glimmer/component';
import { action } from '@ember/object';
import { resolveStatus, statusClass } from './-field-status.js';

const SIZES = ['xs', 'sm', 'lg'];

export default class NuSelectComponent extends Component {
  get classes() {
    const parts = ['nu-input', 'nu-select'];
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

  // Resolves selection here, not in the template, so the template stays declarative.
  get normalizedOptions() {
    const options = this.args.options || [];
    return options.map((option) => {
      const isObject = option !== null && typeof option === 'object';
      const value = isObject ? option.value : option;
      const label = isObject ? option.label : option;
      return { value, label, selected: value === this.args.value };
    });
  }

  get hasSelection() {
    return this.normalizedOptions.some((option) => option.selected);
  }

  @action
  handleChange(event) {
    this.args.onChange?.(event.target.value, event);
  }
}
