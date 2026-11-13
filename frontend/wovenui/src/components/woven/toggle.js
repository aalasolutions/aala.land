import Component from '@glimmer/component';
import { action } from '@ember/object';
import { resolveStatus } from './-field-status.js';
import { SIZE_MAP } from './-constants';

export default class WovenToggleComponent extends Component {
  get classes() {
    return ['wu-toggle', SIZE_MAP[this.args.size]].filter(Boolean).join(' ');
  }

  get status() {
    return resolveStatus(this.args);
  }

  get isInvalid() {
    return this.status === 'error';
  }

  @action
  handleChange(event) {
    this.args.onChange?.(event.target.checked, event);
  }
}
