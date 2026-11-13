import Component from '@glimmer/component';
import { action } from '@ember/object';
import { resolveStatus } from './-field-status.js';
import { SIZE_MAP } from './-constants';

export default class WovenCheckboxComponent extends Component {
  get classes() {
    return ['wu-checkbox', SIZE_MAP[this.args.size]].filter(Boolean).join(' ');
  }

  get status() {
    return resolveStatus(this.args);
  }

  get isInvalid() {
    return this.status === 'error';
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
