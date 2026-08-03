import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class NuConfirmModalComponent extends Component {
  get confirmText() {
    return this.args.confirmText ?? 'Confirm';
  }

  get cancelText() {
    return this.args.cancelText ?? 'Cancel';
  }

  get confirmingText() {
    return this.args.confirmingText ?? this.confirmText;
  }

  get showCancel() {
    return this.args.showCancel !== false;
  }

  // Confirming is not deleting, so this defaults to primary and `danger` is
  // opt-in. Not whitelisted here on purpose: Nuvo::Button already validates
  // @variant, and a second copy of that list is just somewhere to drift.
  get confirmVariant() {
    return this.args.confirmVariant ?? 'primary';
  }

  get isConfirming() {
    return Boolean(this.args.isConfirming);
  }

  // The dialog must not be dismissable while the confirm handler is in flight,
  // otherwise the caller's request resolves against a dialog that is already
  // gone. This covers Esc, the backdrop and the header close button together.
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
