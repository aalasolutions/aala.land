import Component from '@glimmer/component';
import { action } from '@ember/object';
import { modifier } from 'ember-modifier';
import { OUTBOUND_ACCEPT } from 'land/utils/wa-outbound-media';

export default class WhatsappAttachButtonComponent extends Component {
  accept = OUTBOUND_ACCEPT;
  _input = null;

  registerInput = modifier((element) => {
    this._input = element;
    return () => {
      if (this._input === element) this._input = null;
    };
  });

  @action
  openPicker() {
    this._input?.click();
  }

  // Cleared so picking the same file again still fires change.
  @action
  onChange(event) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length) this.args.onFiles?.(files);
  }
}
