import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class ConfirmModalComponent extends Component {
  get cancelText() {
    return this.args.cancelText ?? 'I changed my mind';
  }

  @action
  close() {
    this.args.onClose?.();
  }

  @action
  confirm() {
    this.args.onConfirm?.();
  }
}
