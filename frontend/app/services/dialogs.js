import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

// Only one dialog at a time; a second call while one is open is rejected, not queued.
export default class DialogsService extends Service {
  @tracked current = null;
  @tracked isConfirming = false;

  get isOpen() {
    return this.current !== null;
  }

  // onConfirm throwing keeps the dialog open for retry; resolves true/false, never rejects.
  confirm(options = {}) {
    if (this.isOpen) {
      return Promise.reject(new Error('A dialog is already open'));
    }

    return new Promise((resolve) => {
      this.current = { ...options, resolve };
    });
  }

  // options: same shape as confirm(), minus the cancel button.
  alert(options = {}) {
    return this.confirm({
      confirmText: 'OK',
      ...options,
      showCancel: false,
    });
  }

  // @action binds this; host passes these straight through as callbacks.
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
        // Stay open for retry/cancel; closing here undercuts the caller's own error toast.
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
