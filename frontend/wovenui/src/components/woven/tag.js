import Component from '@glimmer/component';
import { action } from '@ember/object';
import { TAG_MODIFIERS } from './-constants';

export default class WovenTagComponent extends Component {
  get classes() {
    const modifier = TAG_MODIFIERS[this.args.variant];
    return modifier ? `wu-tag ${modifier}` : 'wu-tag';
  }

  // Names the tag, so a row of remove buttons is told apart; block form passes @removeLabel.
  get removeLabel() {
    if (this.args.removeLabel) return this.args.removeLabel;
    return this.args.text ? `Remove ${this.args.text}` : 'Remove tag';
  }

  @action
  handleClose(event) {
    if (this.args.disabled) {
      return;
    }
    this.args.onClose?.(event);
  }
}
