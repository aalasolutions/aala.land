import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class ConfirmModalComponent extends Component {
  @action
  close() {
    this.args.onClose?.();
  }

  @action
  confirm() {
    this.args.onConfirm?.();
  }
}