import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class NuConfirmModalComponent extends Component {
  get confirmText() {
    return this.args.confirmText ?? 'Confirm';
  }

  get cancelText() {
    return this.args.cancelText ?? 'I changed my mind';
  }

  get confirmingText() {
    return this.args.confirmingText ?? this.confirmText;
  }

  get showCancel() {
    return this.args.showCancel !== false;
  }

  // Confirming is not deleting, so this defaults to primary and `danger` is opt-in.
  get confirmVariant() {
    return this.args.confirmVariant ?? 'primary';
  }

  get isConfirming() {
    return Boolean(this.args.isConfirming);
  }

  // Dismissing mid-confirm would resolve the caller's request against a gone dialog.
  get allowDismiss() {
    return !this.isConfirming;
  }

  get showClose() {
    return this.args.showClose !== false && this.allowDismiss;
  }

  @action
  close() {
    if (this.isConfirming) {
      return;
    }
    this.args.onClose?.();
  }

  @action
  confirm() {
    if (this.isConfirming) {
      return;
    }
    this.args.onConfirm?.();
  }
}
