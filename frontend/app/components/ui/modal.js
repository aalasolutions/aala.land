import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class ModalComponent extends Component {
  @action
  close() {
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}