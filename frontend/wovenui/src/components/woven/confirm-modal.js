import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import WovenDialogBaseComponent from './-dialog-base';

export default class WovenConfirmModalComponent extends WovenDialogBaseComponent {
  titleId = `wu-confirm-title-${guidFor(this)}`;
  messageId = `wu-confirm-message-${guidFor(this)}`;

  get classes() {
    const parts = ['wu-modal', 'wu-confirm-modal'];
    if (this.confirmVariant === 'danger') {
      parts.push('danger');
    }
    if (this.animated) {
      parts.push('animated');
    }
    return parts.join(' ');
  }

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

  get confirmVariant() {
    return this.args.confirmVariant ?? 'brand';
  }

  get isConfirming() {
    return Boolean(this.args.isConfirming);
  }

  // Dismissing mid-confirm would resolve the caller's request against a gone dialog.
  get allowEsc() {
    return !this.isConfirming && this.args.closeOnEsc !== false;
  }

  get allowBackdrop() {
    return !this.isConfirming && this.closeOnBackdrop;
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
