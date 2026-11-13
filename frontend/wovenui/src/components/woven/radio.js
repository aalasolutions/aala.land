import Component from '@glimmer/component';
import { action } from '@ember/object';
import { resolveStatus } from './-field-status.js';
import { SIZE_MAP } from './-constants';

export default class WovenRadioComponent extends Component {
  get classes() {
    return ['wu-radio', SIZE_MAP[this.args.size]].filter(Boolean).join(' ');
  }

  // Invalid state belongs to the group (ARIA): Woven::FieldGroup writes aria-invalid; `@status` only marks this input.
  get status() {
    return resolveStatus(this.args);
  }

  @action
  handleChange(event) {
    if (event.target.checked) {
      this.args.onChange?.(this.args.value, event);
    }
  }
}
