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

  /**
   * Ask the user to confirm something.
   *
   * @param {object} options
   * @param {string} options.title
   * @param {string} [options.message]
   * @param {string} [options.confirmVariant='primary'] Any Nuvo::Button
   *   variant. `danger` is opt-in: confirming is not automatically deleting.
   * @param {string} [options.confirmText='Confirm']
   * @param {string} [options.cancelText='Cancel']
   * @param {string} [options.confirmingText] Label while `onConfirm` runs.
   * @param {boolean} [options.showCancel=true] `false` renders an alert.
   * @param {Function} [options.onConfirm] Optional async handler. When given,
   *   the dialog shows a pending state and stays open until it settles, so the
   *   user cannot double-submit. If it throws, the dialog STAYS OPEN with the
   *   spinner cleared so the user can retry or cancel. `onConfirm` owns its own
   *   error reporting, exactly as `utils/delete-modal.js` did before this: it
   *   toasted the failure and deliberately left the dialog up.
   * @returns {Promise<boolean>} true if confirmed, false if dismissed. It
   *   reports the user's decision only, and never rejects on a handler error.
   */
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
