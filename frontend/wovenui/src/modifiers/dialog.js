import Modifier from 'ember-modifier';
import { service } from '@ember/service';
import { registerDestructor } from '@ember/destroyable';
import { runTask, cancelTask } from 'ember-lifeline';
import { openDialog, focusFirstControl } from '../utils/dialog-focus';

// Drives a native <dialog> with showModal(): Escape via the `cancel` event,
// click outside the content box, focus trap and restore, scroll lock, and the
// dialog's own .wu-layer registration. Named args are read at event time.
//
// {{dialog open onClose=fn closeOnEsc=true closeOnBackdrop=true}}
export default class DialogModifier extends Modifier {
  @service layer;

  element = null;
  options = {};
  shown = false;
  focusTask = null;
  downOutside = false;
  release = null;

  constructor(owner, args) {
    super(owner, args);
    registerDestructor(this, () => this.hide());
  }

  modify(element, [open = true], named) {
    this.element = element;
    this.options = named;
    if (open && !this.shown) {
      this.show();
    } else if (!open && this.shown) {
      this.hide();
    }
  }

  show() {
    const { element } = this;
    if (!element.isConnected) return;
    this.shown = true;
    // Before showModal(), so the trigger is what focus returns to.
    this.release = openDialog(element);
    if (!element.open) element.showModal();
    const layer = element.querySelector(':scope > .wu-layer');
    if (layer) this.layer.registerDialogLayer(element, layer);
    element.addEventListener('cancel', this.onCancel);
    element.addEventListener('close', this.onNativeClose);
    element.addEventListener('mousedown', this.onMousedown);
    element.addEventListener('click', this.onClick);
    this.focusTask = runTask(this, () => focusFirstControl(element), 0);
  }

  hide() {
    const { element } = this;
    if (!this.shown || !element) return;
    this.shown = false;
    if (this.focusTask) {
      cancelTask(this, this.focusTask);
      this.focusTask = null;
    }
    element.removeEventListener('cancel', this.onCancel);
    element.removeEventListener('close', this.onNativeClose);
    element.removeEventListener('mousedown', this.onMousedown);
    element.removeEventListener('click', this.onClick);
    this.layer.unregisterDialogLayer(element);
    if (element.open) element.close();
    this.release?.();
    this.release = null;
  }

  requestClose() {
    if (this.options.closeOnEsc === false) return;
    this.options.onClose?.();
  }

  // The caller owns the open state, so the native close is always cancelled.
  onCancel = (event) => {
    if (event.target !== this.element) return;
    event.preventDefault();
    this.requestClose();
  };

  // A repeated Escape without user activation closes the dialog uncancelably; reopen and ask the caller.
  onNativeClose = (event) => {
    if (event.target !== this.element || !this.shown) return;
    if (this.element.isConnected) this.element.showModal();
    this.requestClose();
  };

  isOutside(event) {
    const rect = this.element.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  }

  // Both ends on the backdrop, so a text selection dragged out of the dialog does not close it.
  onMousedown = (event) => {
    this.downOutside = event.target === this.element && this.isOutside(event);
  };

  onClick = (event) => {
    const downOutside = this.downOutside;
    this.downOutside = false;
    if (event.target !== this.element || !downOutside) return;
    if (!this.isOutside(event)) return;
    if (this.options.closeOnBackdrop === false) return;
    this.options.onClose?.();
  };
}
