import Component from '@glimmer/component';
import { action } from '@ember/object';
import { resolveStatus } from './-field-status.js';
import { SIZE_MAP } from './-constants';

export default class WovenSelectComponent extends Component {
  get classes() {
    return ['wu-select', SIZE_MAP[this.args.size]].filter(Boolean).join(' ');
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
