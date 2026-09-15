import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

// Promise-based dialogs, modelled on Element Plus's MessageBox service.
//
// Before this, every caller hand-rolled the same three tracked properties and
// three actions on its controller. That is also why `properties/unit.js` needed
// two parallel sets of flags for its two dialogs. Holding the state here means a
// controller can open any number of dialogs without naming any of them.
//
// One dialog at a time. Anything queued would stack modals on top of each other,
// which the backdrop is not built for, so a second call while one is open is
// rejected rather than silently dropped.
export default class DialogsService extends Service {
  @tracked current = null;
  @tracked isConfirming = false;

  get isOpen() {
    return this.current !== null;
  }

  /** Opens a confirm dialog; resolves true on confirm. Options: title, message, confirmVariant, confirmText, cancelText, confirmingText, showCancel, onConfirm. */
  confirm(options = {}) {
    if (this.isOpen) {
      return Promise.reject(new Error('A dialog is already open'));
    }

    return new Promise((resolve) => {
      this.current = { ...options, resolve };
    });
  }

  /**
   * Tell the user something. One button, nothing to decide.
   * Resolves when acknowledged or dismissed.
   *
   * @param {object} options Same shape as `confirm`, minus the cancel button.
   * @returns {Promise<boolean>}
   */
  alert(options = {}) {
    return this.confirm({
      confirmText: 'OK',
      ...options,
      showCancel: false,
    });
  }

  // @action for the auto-binding: the host passes these straight through as
  // callbacks, so an unbound method would lose `this`.
  @action
  async handleConfirm() {
    const dialog = this.current;
    if (!dialog || this.isConfirming) {
      return;
    }

    if (dialog.onConfirm) {
      this.isConfirming = true;
      try {
        await dialog.onConfirm();
      } catch {
        // Stay open so the user can retry or cancel. Closing here would pull
        // the dialog out from under the caller's own error toast.
        this.isConfirming = false;
        return;
      }
      this.isConfirming = false;
    }

    this.current = null;
    dialog.resolve(true);
  }

  @action
  handleClose() {
    const dialog = this.current;
    if (!dialog || this.isConfirming) {
      return;
    }

    this.current = null;
    dialog.resolve(false);
  }
}
